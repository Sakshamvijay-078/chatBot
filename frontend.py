import uuid
import streamlit as st

from backend import workflow
from memory import build_context, manage_memory, extract_user_facts
from database import (
    init_db,
    create_chat,
    get_chats,
    save_message,
    get_messages,
    update_title,
    delete_chat,
    count_messages
)

init_db()

st.set_page_config(
    page_title="AI Assistant",
    page_icon="🤖",
    layout="wide",
)

# ---------------- Sidebar ----------------
with st.sidebar:
    st.title("💬 Chats")
    
    if st.button("➕ New Chat", use_container_width=True):
        current_chat_id = st.session_state.get("current_chat")
        if current_chat_id and len(get_messages(current_chat_id)) == 0:
            st.toast("You are already in an empty chat!")
        else:
            thread_id = str(uuid.uuid4())
            create_chat(thread_id)
            st.session_state.current_chat = thread_id
            st.rerun()
            
    st.divider()
    chats = get_chats()
    if chats:
        for thread_id, title in chats:
            col1, col2 = st.columns([8, 2])
            with col1:
                if st.button(title, key=f"chat_{thread_id}", use_container_width=True):
                    st.session_state.current_chat = thread_id
                    st.rerun()
            with col2:
                if st.button("🗑️", key=f"del_{thread_id}"):
                    delete_chat(thread_id) 
                    if st.session_state.get("current_chat") == thread_id:
                        del st.session_state["current_chat"]
                    st.rerun()

# First Run
if "current_chat" not in st.session_state:
    chats = get_chats()
    if chats:
        st.session_state.current_chat = chats[0][0]
    else:
        thread_id = str(uuid.uuid4())
        create_chat(thread_id)
        st.session_state.current_chat = thread_id

thread_id = st.session_state.current_chat

# ---------------- Header ----------------
st.title("🤖 AI Assistant")

# ---------------- Messages ----------------
db_messages = get_messages(thread_id)
for role, content in db_messages:
    with st.chat_message(role):
        st.markdown(content)

# ---------------- Input ----------------
if prompt := st.chat_input("Ask anything..."):
    save_message(thread_id, "user", prompt)
    # Phase 4: Silently extract facts in the background
    extract_user_facts(prompt)
    # Update title only if it's the first message
    if count_messages(thread_id) == 1:
        title = prompt[:30]
        update_title(thread_id, title)
        
    with st.chat_message("user"):
        st.markdown(prompt)
        
    with st.chat_message("assistant"):
        placeholder = st.empty()
        full_response = ""
        
        # Phase 3: Use the new memory context builder (includes the newly saved prompt)
        history = build_context(thread_id)
        
        for chunk, metadata in workflow.stream(
            {"messages": history},
            stream_mode="messages",
        ):
            if chunk.content:
                full_response += chunk.content
                placeholder.markdown(full_response + "▌")
        placeholder.markdown(full_response)
        
    save_message(thread_id, "assistant", full_response)
    
    # Phase 3: Hybrid Memory Management
    manage_memory(thread_id)
    st.rerun()