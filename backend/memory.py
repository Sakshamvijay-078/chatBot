"""
memory.py — Penda Backend
Ported from the original Streamlit memory.py. 
Works with user_id (UUID) instead of username strings,
and uses the new Supabase database.py functions.
"""

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


def count_tokens(text: str) -> int:
    """Estimate token count using the cl100k_base tokenizer."""
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        return int(len(text.split()) * 1.3)


def manage_memory(chat_id: str, llm, msg_limit: int = 10, token_limit: int = 3000) -> None:
    """
    Checks message count and token usage. If either exceeds the limit,
    it compresses history into a rolling summary and deletes old messages.

    NOTE: `llm` is now passed in as a parameter (injected from main.py)
    so this module stays stateless and testable.
    """
    messages = get_messages(chat_id)
    if not messages:
        return

    if len(messages) >= msg_limit:
        _update_summary(chat_id, llm)
        return

    summary = get_summary(chat_id)
    full_text = summary + "\n".join([m["content"] for m in messages])
    if count_tokens(full_text) >= token_limit:
        _update_summary(chat_id, llm)


def _update_summary(chat_id: str, llm) -> None:
    """Internal: compress chat history into a rolling summary."""
    current_summary = get_summary(chat_id)
    messages = get_messages(chat_id)
    if not messages:
        return

    chat_history = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
    prompt = (
        f"Current summary: {current_summary}\n\n"
        f"Recent conversation:\n{chat_history}\n\n"
        "Write a concise updated summary of the conversation so far. Only reply with the summary."
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    save_summary(chat_id, response.content)
    delete_old_messages(chat_id, keep=6)


def build_context(chat_id: str, user_id: str, llm, current_prompt: str = "") -> list:
    """
    Assembles the full message context list to send to the LLM:
    [system instructions] + [rolling summary] + [recent messages]

    RAG querying is handled inside main.py now (passed as rag_chunks).
    """
    summary = get_summary(chat_id)
    recent_messages = get_recent_messages(chat_id, limit=6)
    user_facts = get_user_facts(user_id)
    profile = get_profile(user_id)

    history = []

    # 1. User profile system message
    if profile:
        style = profile.get("style", "Be concise and helpful.")
        expertise = profile.get("expertise_level", "intermediate")
        name = profile.get("display_name", "the user")
        history.append(SystemMessage(
            content=(
                f"You are Penda, an AI assistant. You are speaking with {name}. "
                f"Expertise level: {expertise}. "
                f"Strictly follow this style directive: {style}\n\n"
                "CRITICAL RULES you MUST follow on every response:\n"
                "1. Answer ONLY the user's MOST RECENT message. Ignore older messages in history unless directly relevant.\n"
                "2. NEVER cut your response short. Always finish your complete thought and the last sentence before stopping.\n"
                "3. When you use web_search, you MUST include the actual source URLs in your answer in markdown link format: [Title](URL).\n"
                "4. Only use tools when the question genuinely requires current data or a URL is provided. Never use tools for simple factual questions you already know."
            )
        ))

    # 2. Long-term user memory
    if user_facts:
        facts_str = "\n".join([f"- {fact}" for fact in user_facts])
        history.append(SystemMessage(content=f"Important long-term facts about the user:\n{facts_str}"))

    # 3. Rolling conversation summary
    if summary:
        history.append(SystemMessage(content=f"Conversation Summary so far: {summary}"))

    # 4. Recent messages
    for msg in recent_messages:
        if msg["role"] == "user":
            history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            history.append(AIMessage(content=msg["content"]))

    return history


def extract_user_facts(user_message: str, user_id: str, llm) -> None:
    """
    Calls the LLM to check if the user's message contains a permanent fact.
    If yes, saves it to user_memory.
    """
    prompt = (
        "Analyze the following user message. If the user explicitly states a permanent "
        "or long-term fact about themselves (e.g., their name, profession, tech stack, "
        "preferences, or goals), extract it as a concise, objective statement "
        "(e.g., 'User is a BTech student', 'User prefers Python').\n\n"
        "If there is no permanent fact in the message, you MUST reply EXACTLY with the word 'NONE'.\n\n"
        f"Message: {user_message}"
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    fact = response.content.strip()

    if fact and fact.upper() != "NONE":
        save_user_fact(user_id, fact, importance=5)
