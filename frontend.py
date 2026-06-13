import uuid
import streamlit as st

from backend import workflow
from memory import build_context, manage_memory, extract_user_facts
from rag import process_pdf
from database import (
    init_db, create_chat, get_chats, save_message,
    get_messages, update_title, delete_chat, count_messages
)

init_db()

st.set_page_config(page_title="AI Assistant", page_icon="🤖", layout="wide")

# Initialize session state for tracking generation status
if "generating" not in st.session_state:
    st.session_state.generating = False

# ---------------- Sidebar (Global Controls Only) ----------------
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
        for t_id, title in chats:
            col1, col2 = st.columns([8, 2])
            with col1:
                if st.button(title, key=f"chat_{t_id}", use_container_width=True):
                    st.session_state.current_chat = t_id
                    st.rerun()
            with col2:
                if st.button("🗑️", key=f"del_{t_id}"):
                    delete_chat(t_id) 
                    if st.session_state.get("current_chat") == t_id:
                        del st.session_state["current_chat"]
                    st.rerun()

    # Global Knowledge Base exclusively stays in the sidebar
    st.divider()
    st.subheader("🌐 Global Knowledge Base")
    global_file = st.file_uploader("Upload textbook / reference manual", type=["pdf"], key="global_upload")
    if global_file and st.button("Add to Global Knowledge", use_container_width=True):
        with st.spinner("Vectorizing global document..."):
            process_pdf(global_file.read(), thread_id=None, is_global=True)
        st.success("Added to global memory!")

# First Run Configuration
if "current_chat" not in st.session_state:
    chats = get_chats()
    if chats:
        st.session_state.current_chat = chats[0][0]
    else:
        thread_id = str(uuid.uuid4())
        create_chat(thread_id)
        st.session_state.current_chat = thread_id

thread_id = st.session_state.current_chat

# ---------------- Main Chat UI ----------------
st.title("🤖 AI Assistant")

# Display historical messages
db_messages = get_messages(thread_id)
for role, content in db_messages:
    with st.chat_message(role):
        st.markdown(content)

# Create a dedicated placeholder for streaming responses
assistant_placeholder = st.empty()

# ---------------- Bottom Control Zone ----------------
st.write("") # Spacer

# 1. Active Chat Document Uploader (Now Static in an Expander)
with st.expander("📎 Manage Chat Documents", expanded=False):
    chat_file = st.file_uploader("Attach a PDF to this specific chat session", type=["pdf"], key="chat_upload")
    if chat_file:
        if st.button("⚡ Index Document", use_container_width=True):
            with st.spinner("Reading file..."):
                process_pdf(chat_file.read(), thread_id, is_global=False)
            st.success("Indexed successfully!")

# 2. Dynamic Stop Generation Button (Appears only while generating)
stop_placeholder = st.empty()
if st.session_state.generating:
    if stop_placeholder.button("⏹️ Stop Generation", use_container_width=True):
        st.session_state.stop_generation = True

# 3. Core Text Input Bar
prompt = st.chat_input("Ask anything...", disabled=st.session_state.generating)

# ---------------- Chat Execution Flow ----------------
if prompt and not st.session_state.generating:
    # Save user message immediately
    save_message(thread_id, "user", prompt)
    extract_user_facts(prompt)
    
    if count_messages(thread_id) == 1:
        title = prompt[:30]
        update_title(thread_id, title)
        
    st.session_state.generating = True
    st.session_state.stop_generation = False
    st.rerun()

# Handle the active generation loop if triggered
if st.session_state.generating and not st.session_state.get("stop_generation", False):
    # Fetch user prompt from the latest database entry
    recent_msgs = get_messages(thread_id)
    last_user_prompt = recent_msgs[-1][1] if recent_msgs else ""
    
    # Render the new user prompt visually
    with st.chat_message("user"):
        st.markdown(last_user_prompt)
        
    with st.chat_message("assistant"):
        placeholder = assistant_placeholder.empty()
        full_response = ""
        
        # Build context including local/global RAG search
        history = build_context(thread_id, current_prompt=last_user_prompt)
        
        for chunk, metadata in workflow.stream({"messages": history}, stream_mode="messages"):
            if st.session_state.get("stop_generation", False):
                break
            if chunk.content:
                full_response += chunk.content
                placeholder.markdown(full_response + "▌")
                
        placeholder.markdown(full_response)
        
    # Save assistant message and reset states
    save_message(thread_id, "assistant", full_response)
    manage_memory(thread_id)
    
    st.session_state.generating = False
    st.session_state.stop_generation = False
    stop_placeholder.empty()
    st.rerun()