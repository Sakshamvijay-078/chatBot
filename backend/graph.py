"""
graph.py — Penda Backend
The LangGraph workflow logic, extracted from the original backend.py.

Growth-scope §1C — Async LLM Integration:
  Migrated to native async equivalents (astream) so the FastAPI application
  is truly asynchronous with zero thread overhead for streaming chat.
  - build_async_chat_workflow() returns a compiled graph with an async assistant node.
  - astream_chat_workflow() is an async generator that yields (chunk, metadata) pairs
    directly from the LangGraph astream — no ThreadPoolExecutor, no queue bridge.

The synchronous build_chat_workflow / build_ats_workflow are kept so the ATS
endpoint (which still uses run_in_executor for its blocking invoke) continues to work.
"""

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


# ============================================================
# LLM Factory
# ============================================================

def build_llm(api_key: str, model: str = "llama-3.1-8b-instant") -> ChatGroq:
    """Construct a ChatGroq LLM with the provided API key and model."""
    return ChatGroq(api_key=api_key, model=model)


# ============================================================
# §1C — Async Chat Workflow
# Uses native astream so the event loop is never blocked.
# ============================================================

def build_async_chat_workflow(api_key: str, model: str = "llama-3.1-8b-instant"):
    """
    Compile a LangGraph chat workflow with an ASYNC assistant node.
    Use astream_chat_workflow() to consume it without any thread overhead.
    """
    llm = build_llm(api_key, model)
    llm_with_tools = llm.bind_tools(TOOLS)

    async def assistant(state: ChatState):
        # ainvoke keeps the async event loop free while waiting for Groq
        response = await llm_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(ChatState)
    graph.add_node("assistant", assistant)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_edge(START, "assistant")
    graph.add_conditional_edges("assistant", tools_condition)
    graph.add_edge("tools", "assistant")

    return graph.compile()


async def astream_chat_workflow(
    api_key: str,
    model: str,
    history: list,
) -> AsyncGenerator[tuple, None]:
    """
    Async generator that streams (chunk, metadata) pairs from the LangGraph
    workflow using native astream — no ThreadPoolExecutor, no queue bridge.

    Growth-scope §1C: reduces thread overhead and improves concurrent
    request handling on Render's single-worker free tier.
    """
    workflow = build_async_chat_workflow(api_key, model)
    async for chunk, metadata in workflow.astream(
        {"messages": history}, stream_mode="messages"
    ):
        yield chunk, metadata


# ============================================================
# Sync Chat Workflow (kept for any non-streaming path)
# ============================================================

def build_chat_workflow(api_key: str, model: str = "llama-3.1-8b-instant"):
    """
    Compile and return a synchronous LangGraph chat workflow.
    Kept for compatibility — new streaming path uses astream_chat_workflow().
    """
    llm = build_llm(api_key, model)
    llm_with_tools = llm.bind_tools(TOOLS)

    def assistant(state: ChatState):
        response = llm_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(ChatState)
    graph.add_node("assistant", assistant)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_edge(START, "assistant")
    graph.add_conditional_edges("assistant", tools_condition)
    graph.add_edge("tools", "assistant")

    return graph.compile()


# ============================================================
# ATS Workflow (sync — invoked via run_in_executor in main.py)
# ============================================================

def build_ats_workflow(api_key: str, model: str = "llama3-8b-8192"):
    """Compile and return the ATS resume optimization workflow."""
    llm = build_llm(api_key, model)

    def ats_critique_node(state: ATSState):
        prompt = (
            "You are an expert technical recruiter. Analyze the following resume against the Job Description. "
            "1. Give an estimated ATS match percentage.\n"
            "2. Identify exactly which required keywords or skills are missing.\n\n"
            f"Job Description:\n{state['job_description']}\n\n"
            f"Resume:\n{state['resume_text']}"
        )
        response = llm.invoke(prompt)
        return {"critique": response.content}

    def ats_refine_node(state: ATSState):
        prompt = (
            "You are a professional resume writer. Based on the following critique, "
            "write 3-5 highly impactful, action-oriented bullet points the user can directly paste into their resume "
            "to improve their ATS score. Use quantifiable metrics where possible.\n\n"
            f"Critique Context:\n{state['critique']}\n\n"
            f"Original Resume:\n{state['resume_text']}"
        )
        response = llm.invoke(prompt)
        return {"refined_bullets": response.content}

    ats_graph = StateGraph(ATSState)
    ats_graph.add_node("critique", ats_critique_node)
    ats_graph.add_node("refine", ats_refine_node)
    ats_graph.add_edge(START, "critique")
    ats_graph.add_edge("critique", "refine")
    ats_graph.add_edge("refine", END)

    return ats_graph.compile()
