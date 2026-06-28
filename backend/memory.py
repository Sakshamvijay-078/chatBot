import tiktoken
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from database import (
    get_summary,
    save_summary,
    get_messages,
    delete_old_messages,
    get_recent_messages,
    save_user_fact,
    get_user_facts,
    get_profile,
)

def estimate_tokens(text: str) -> int:
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        # Better fallback ratio
        return int(len(text.split()) * 1.3)

# ────────────────────────────────────────────────────────────
# Heuristic pre-filter: skip messages that can't hold user facts
# ────────────────────────────────────────────────────────────
_SKIP_PREFIXES = (
    "what ", "who ", "how ", "when ", "where ", "why ", "can you ",
    "please ", "tell me ", "explain ", "write ", "generate ", "create ",
    "hi", "hello", "hey", "thanks", "thank you", "ok", "okay", "sure",
    "search ", "find ", "look up", "show ", "list ", "give me ",
)

def _message_may_contain_facts(msg: str) -> bool:
    """Return True only if the message might contain a user self-disclosure."""
    stripped = msg.strip()
    if len(stripped) < 25:          # Too short to contain a meaningful fact
        return False
    lower = stripped.lower()
    for prefix in _SKIP_PREFIXES:
        if lower.startswith(prefix):
            return False
    # Must contain first-person references to be worth checking
    first_person = ("i am", "i'm", "my ", "i use", "i work", "i study",
                    "i like", "i prefer", "i hate", "i need", "i want",
                    "i have", "i've", "i do", "i'm a", "i am a")
    return any(fp in lower for fp in first_person)


async def manage_memory(chat_id: str, llm, msg_limit: int = 20, token_limit: int = 6000) -> None:
    """Summarise old messages only when the conversation is large — raised thresholds."""
    messages = get_messages(chat_id)
    if not messages:
        return
    if len(messages) >= msg_limit:
        await _update_summary(chat_id, llm)
        return
    
    summary = get_summary(chat_id)
    full_text = summary + "\n".join([m["content"] for m in messages])
    
    if estimate_tokens(full_text) >= token_limit:
        await _update_summary(chat_id, llm)

import asyncio
from database import get_summary, get_messages, save_summary, delete_old_messages

async def _update_summary(chat_id: str, llm) -> None:
    current_summary = await asyncio.to_thread(get_summary, chat_id)
    messages = await asyncio.to_thread(get_messages, chat_id)
    if not messages:
        return
        
    chat_history = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
    prompt = f"Current summary: {current_summary}\n\nRecent conversation:\n{chat_history}..."
    
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    
    await asyncio.to_thread(save_summary, chat_id, response.content)
    await asyncio.to_thread(delete_old_messages, chat_id, keep=6)


def build_context(chat_id: str, user_id: str, llm, current_prompt: str = "") -> list:
    summary = get_summary(chat_id)
    recent_messages = get_recent_messages(chat_id, limit=6)
    user_facts = get_user_facts(user_id)
    profile = get_profile(user_id)
    
    history = []
    
    system_content = ""
    
    if profile:
        style = profile.get("style", "Be concise and helpful.")
        expertise = profile.get("expertise_level", "intermediate")
        name = profile.get("display_name", "the user")
        
        system_content += (
            f"You are Penda, an AI assistant. You are speaking with {name}. "
            f"Expertise level: {expertise}. "
            f"Strictly follow this style directive: {style}\n\n"
            "CRITICAL RULES:\n"
            "1. Answer ONLY the user's MOST RECENT message. Ignore older messages unless directly relevant.\n"
            "2. NEVER cut your response short.\n"
            "3. When using web_search, include actual source URLs in markdown format: [Title](URL).\n"
            "4. Only use tools when genuinely required.\n"
            "5. Combine multiple questions into ONE web_search call — do NOT call web_search more than once per response.\n\n"
        )

    if summary:
        system_content += f"[Conversation Summary so far]:\n{summary}\n\n"

    if user_facts:
        facts_str = "\n".join([f"- {fact}" for fact in user_facts])
        system_content += f"[Important facts about the user]:\n{facts_str}\n\n"

    if system_content.strip():
        history.append(SystemMessage(content=system_content.strip()))

    for msg in recent_messages:
        if msg["role"] == "user":
            history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            history.append(AIMessage(content=msg["content"]))

    return history


async def extract_user_facts(user_message: str, user_id: str, llm) -> None:
    """Extract long-term user facts — skipped entirely if the message can't contain one."""
    # Fast pre-filter: most messages (questions, commands, greetings) never contain facts
    if not _message_may_contain_facts(user_message):
        return

    prompt = (
        "Analyze the following user message. If the user explicitly states a permanent "
        "or long-term fact about themselves (e.g., their name, profession, tech stack, "
        "preferences, or goals), extract it as a concise, objective statement "
        "(e.g., 'User is a BTech student', 'User prefers Python').\n\n"
        "If there is no permanent fact in the message, you MUST reply EXACTLY with the word 'NONE'.\n\n"
        f"Message: {user_message}"
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    fact = response.content.strip()

    if fact and not fact.upper().startswith("NONE"):
        save_user_fact(user_id, fact, importance=5)