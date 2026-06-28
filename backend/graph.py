from typing import AsyncGenerator, TypedDict, Annotated
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from tools import TOOLS

# ============================================================
# Shared State Types
# ============================================================

class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

class ATSState(TypedDict):
    resume_text: str
    job_description: str
    critique: str
    refined_bullets: str

def build_llm(api_key: str, model: str) -> ChatGroq:
    return ChatGroq(
        api_key=api_key,
        model=model,
        max_retries=1,      # Don't let the SDK retry for 24-44s; fail fast instead
        timeout=30,         # 30s per LLM call; keeps tool loops from stalling
    )

# FIXED: Defaulting to an active, fast Groq model with high rate limits
def build_chat_workflow(api_key: str, model: str = "llama-3.1-8b-instant"):
    llm = build_llm(api_key, model)
    llm_with_tools = llm.bind_tools(TOOLS)

    async def assistant(state: ChatState):
        response = await llm_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(ChatState)
    graph.add_node("assistant", assistant)
    graph.add_node("tools", ToolNode(TOOLS))

    graph.add_edge(START, "assistant")
    graph.add_conditional_edges("assistant", tools_condition)
    graph.add_edge("tools", "assistant")

    # Cap the assistant↔tool loop at 10 iterations to prevent runaway searches
    return graph.compile()

async def astream_chat_workflow(
    api_key: str,
    model: str,
    history: list,
) -> AsyncGenerator[tuple, None]:
    from langchain_core.messages import SystemMessage as _Sys
    from langchain_core.runnables import RunnableConfig
    # Inject file-writing instructions as a system prefix if not already present
    FILE_SYSTEM_PROMPT = _Sys(content=(
        "You are Penda, a helpful AI assistant. You have access to tools: web_search, calculator, read_webpage, write_file, read_file.\n\n"
        "EFFICIENCY RULES:\n"
        "1. Use web_search ONCE per response — combine all sub-questions into a single query.\n"
        "2. If you already know the answer, answer directly WITHOUT calling any tool.\n"
        "3. Keep your responses concise unless the user asks for detail.\n\n"
        "FILE CREATION: When asked to write/create any file (scripts, code, CSV, etc.), "
        "format it using:\n```file:filename.ext\n<content>\n```\n"
        "This renders a Download button in the UI."
    ))
    augmented = history
    if not history or not isinstance(history[0], _Sys):
        augmented = [FILE_SYSTEM_PROMPT] + list(history)

    workflow = build_chat_workflow(api_key, model)
    # recursion_limit caps the assistant<->tool loop iterations
    config = RunnableConfig(recursion_limit=10)
    async for chunk, metadata in workflow.astream(
        {"messages": augmented}, stream_mode="messages", config=config
    ):
        yield chunk, metadata

# ============================================================
# ATS Agent Workflow
# ============================================================

# FIXED: Defaulting to a larger model for reasoning tasks
def build_ats_workflow(api_key: str, model: str = "llama-3.3-70b-versatile"):
    llm = build_llm(api_key, model)
    
    async def ats_critique_node(state: ATSState):
        prompt = (
            "You are an expert technical recruiter. Analyze the following resume against the Job Description. "
            "1. Give an estimated ATS match percentage.\n"
            "2. Identify exactly which required keywords or skills are missing.\n\n"
            f"Job Description:\n{state['job_description']}\n\n"
            f"Resume:\n{state['resume_text']}"
        )
        response = await llm.ainvoke(prompt)
        return {"critique": response.content}

    async def ats_refine_node(state: ATSState):
        prompt = (
            "You are a professional resume writer. Based on the following critique, "
            "write 3-5 highly impactful, action-oriented bullet points the user can directly paste into their resume "
            "to improve their ATS score. Use quantifiable metrics where possible.\n\n"
            f"Critique Context:\n{state['critique']}\n\n"
            f"Original Resume:\n{state['resume_text']}"
        )
        response = await llm.ainvoke(prompt)
        return {"refined_bullets": response.content}

    ats_graph = StateGraph(ATSState)
    ats_graph.add_node("critique", ats_critique_node)
    ats_graph.add_node("refine", ats_refine_node)
    ats_graph.add_edge(START, "critique")
    ats_graph.add_edge("critique", "refine")
    ats_graph.add_edge("refine", END)

    return ats_graph.compile()