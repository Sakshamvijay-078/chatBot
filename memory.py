import tiktoken
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from backend import llm
from database import (
    get_summary, 
    save_summary, 
    get_messages, 
    delete_old_messages, 
    get_recent_messages,
    save_user_fact,
    get_user_facts
)
from rag import query_documents

# Initialize a fast token estimator
def count_tokens(text: str) -> int:
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        # Fallback rough estimate if library fails
        return int(len(text.split()) * 1.3) 

def manage_memory(thread_id, msg_limit=10, token_limit=3000):
    """Checks both limits and triggers a summary if either is exceeded."""
    messages = get_messages(thread_id)
    if not messages:
        return

    # 1. Soft Limit Check: Has the conversation gone on for too many turns?
    if len(messages) >= msg_limit:
        update_summary(thread_id)
        return

    # 2. Hard Limit Check: Did the user paste a massive block of text?
    summary = get_summary(thread_id)
    full_text = summary + "\n".join([content for _, content in messages])
    
    if count_tokens(full_text) >= token_limit:
        update_summary(thread_id)
        return

def update_summary(thread_id):
    current_summary = get_summary(thread_id)
    messages = get_messages(thread_id)
    
    if not messages:
        return

    chat_history = "\n".join([f"{role}: {content}" for role, content in messages])
    prompt = (
        f"Current summary: {current_summary}\n\n"
        f"Recent conversation:\n{chat_history}\n\n"
        "Write a concise updated summary of the conversation so far. Only reply with the summary."
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    new_summary = response.content

    save_summary(thread_id, new_summary)
    delete_old_messages(thread_id, keep=6)

def build_context(thread_id, current_prompt=""):
    summary = get_summary(thread_id)
    recent_messages = get_recent_messages(thread_id, limit=6)
    user_facts = get_user_facts() 
    
    # Fetch RAG context based on the user's latest question
    rag_chunks = query_documents(current_prompt, thread_id) if current_prompt else []
    
    history = []
    
    if user_facts:
        facts_str = "\n".join([f"- {fact}" for fact in user_facts])
        history.append(SystemMessage(content=f"Important facts about the user:\n{facts_str}"))
        
    if summary:
        history.append(SystemMessage(content=f"Conversation Summary: {summary}"))
        
    # Inject the PDF excerpts directly as system instructions
    if rag_chunks:
        rag_context = "\n---\n".join(rag_chunks)
        history.append(SystemMessage(content=f"Use the following document excerpts to answer the user:\n{rag_context}"))
        
    for role, content in recent_messages:
        if role == "user":
            history.append(HumanMessage(content=content))
        else:
            history.append(AIMessage(content=content))
            
    return history

def extract_user_facts(user_message):
    """Silently analyzes a message to extract permanent user facts."""
    prompt = (
        "Analyze the following user message. If the user explicitly states a permanent "
        "or long-term fact about themselves and about you(e.g., their name, profession, tech stack, "
        "preferences,set your name or goals), extract it as a concise, objective statement "
        "(e.g., 'User is a BTech student', 'User prefers Python').\n\n"
        "If there is no permanent fact in the message, you MUST reply EXACTLY with the word 'NONE'.\n\n"
        f"Message: {user_message}"
    )
    
    response = llm.invoke([HumanMessage(content=prompt)])
    fact = response.content.strip()
    
    # Only save if the LLM found a genuine fact
    if fact != "NONE" and fact != "":
        save_user_fact(fact, importance=5)