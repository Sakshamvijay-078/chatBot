import uuid
import streamlit as st

# Make sure to import ats_workflow from backend
from backend import workflow, ats_workflow
from memory import build_context, manage_memory, extract_user_facts
from rag import process_pdf
from database import (
    init_db, create_chat, get_chats, save_message,
    get_messages, update_title, delete_chat, count_messages
)

init_db()

st.set_page_config(page_title="AI Assistant", page_icon="🤖", layout="wide")

# ---------------- Authentication Gate ----------------
if "logged_in_user" not in st.session_state:
    st.title("🔐 Access Terminal")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        with st.form("login_form"):
            username = st.text_input("Developer ID (Username)")
            submit = st.form_submit_button("Initialize Workspace", use_container_width=True)
            
            if submit:
                if username.strip(): 
                    st.session_state.logged_in_user = username.strip()
                    st.rerun()
                else:
                    st.error("Please enter a valid Developer ID.")
    st.stop()

# ---------------- User is Logged In ----------------
with st.sidebar:
    st.markdown(f"👤 **Active User:** `{st.session_state.logged_in_user}`")
    if st.button("🚪 Logout"):
        st.session_state.clear()
        st.rerun()

if "generating" not in st.session_state:
    st.session_state.generating = False

# ---------------- Sidebar ----------------
with st.sidebar:
    st.title("💬 Chats")
    
    if st.button("➕ New Chat", use_container_width=True):
        current_chat_id = st.session_state.get("current_chat")
        if current_chat_id and len(get_messages(current_chat_id)) == 0:
            st.toast("You are already in an empty chat!")
        else:
            thread_id = str(uuid.uuid4())
            create_chat(thread_id, st.session_state.logged_in_user)
            st.session_state.current_chat = thread_id
            st.rerun()
            
    st.divider()
    chats = get_chats(st.session_state.logged_in_user)
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

    st.divider()
    st.subheader("🌐 Global Knowledge Base")
    global_file = st.file_uploader("Upload textbook / reference manual", type=["pdf"], key="global_upload")
    if global_file and st.button("Add to Global Knowledge", use_container_width=True):
        with st.spinner("Vectorizing global document..."):
            process_pdf(global_file.read(), thread_id=None, is_global=True)
        st.success("Added to global memory!")

# First Run Configuration
if "current_chat" not in st.session_state:
    chats = get_chats(st.session_state.logged_in_user)
    if chats:
        st.session_state.current_chat = chats[0][0]
    else:
        thread_id = str(uuid.uuid4())
        create_chat(thread_id, st.session_state.logged_in_user)
        st.session_state.current_chat = thread_id

thread_id = st.session_state.current_chat

# ---------------- Main UI ----------------
st.title("🤖 AI Assistant & Agents")

# Create tabs to separate standard chat from Agentic Workflows
chat_tab, ats_tab = st.tabs(["💬 Standard Chat", "📄 ATS Resume Agent"])

# ==========================================
# TAB 1: Standard Chat
# ==========================================
with chat_tab:
    db_messages = get_messages(thread_id)
    for role, content in db_messages:
        with st.chat_message(role):
            st.markdown(content)

    assistant_placeholder = st.empty()

    st.write("") 

    # 1. Active Chat Document Uploader
    with st.expander("📎 Manage Chat Documents", expanded=False):
        chat_file = st.file_uploader("Attach a PDF to this specific chat session", type=["pdf"], key="chat_upload")
        if chat_file:
            if st.button("⚡ Index Document", use_container_width=True):
                with st.spinner("Reading file..."):
                    process_pdf(chat_file.read(), thread_id, is_global=False)
                st.success("Indexed successfully!")

    # 2. Dynamic Stop Generation Button
    stop_placeholder = st.empty()
    if st.session_state.generating:
        if stop_placeholder.button("⏹️ Stop Generation", use_container_width=True):
            st.session_state.stop_generation = True

    # 3. Core Text Input Bar
    prompt = st.chat_input("Ask anything...", disabled=st.session_state.generating)

    # ---------------- Chat Execution Flow ----------------
    if prompt and not st.session_state.generating:
        save_message(thread_id, "user", prompt)
        extract_user_facts(prompt, st.session_state.logged_in_user)
        
        if count_messages(thread_id) == 1:
            title = prompt[:30]
            update_title(thread_id, title)
            
        st.session_state.generating = True
        st.session_state.stop_generation = False
        st.rerun()

    if st.session_state.generating and not st.session_state.get("stop_generation", False):
        recent_msgs = get_messages(thread_id)
        last_user_prompt = recent_msgs[-1][1] if recent_msgs else ""
        
        with st.chat_message("user"):
            st.markdown(last_user_prompt)
            
        with st.chat_message("assistant"):
            placeholder = assistant_placeholder.empty()
            full_response = ""
            
            history = build_context(thread_id, st.session_state.logged_in_user, current_prompt=last_user_prompt)
            
            for chunk, metadata in workflow.stream({"messages": history}, stream_mode="messages"):
                if st.session_state.get("stop_generation", False):
                    break
                node = metadata.get("langgraph_node", "")
                if node == "assistant":
                    if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                        tool_name = chunk.tool_calls[0].get("name", "tool")
                        placeholder.markdown(f"🔧 *Using tool: `{tool_name}`...*")
                    elif chunk.content:
                        full_response += chunk.content
                        placeholder.markdown(full_response + "▌")

            placeholder.markdown(full_response)
            
        save_message(thread_id, "assistant", full_response)
        manage_memory(thread_id)
        
        st.session_state.generating = False
        st.session_state.stop_generation = False
        stop_placeholder.empty()
        st.rerun()

# ==========================================
# TAB 2: Phase 9 ATS Agent
# ==========================================
with ats_tab:
    st.subheader("🎯 Autonomous ATS Optimization")
    st.write("Upload your resume and paste a job description. The agent will analyze gaps and autonomously rewrite your bullet points.")
    
    col1, col2 = st.columns(2)
    with col1:
        target_jd = st.text_area("Paste Target Job Description", height=200)
    with col2:
        resume_file = st.file_uploader("Upload Current Resume", type=["pdf"], key="ats_upload")
        
    if st.button("🚀 Run ATS Agent Pipeline", use_container_width=True):
        if target_jd and resume_file:
            with st.spinner("Extracting text from PDF..."):
                from rag import extract_text_from_pdf
                resume_text = extract_text_from_pdf(resume_file.read())
                
            # Initialize the agent state
            initial_state = {
                "resume_text": resume_text,
                "job_description": target_jd,
                "critique": "",
                "refined_bullets": ""
            }
            
            st.info("Step 1: Agent is analyzing gaps and calculating ATS match...")
            
            # Run the agentic workflow
            final_state = ats_workflow.invoke(initial_state)
            
            # Display Results
            st.success("Analysis Complete!")
            
            with st.expander("📊 Recruiter Critique (Step 1 Output)", expanded=True):
                st.markdown(final_state["critique"])
                
            with st.expander("✨ Refined Bullet Points (Step 2 Output)", expanded=True):
                st.markdown(final_state["refined_bullets"])
        else:
            st.error("Please provide both a Job Description and a Resume PDF.")