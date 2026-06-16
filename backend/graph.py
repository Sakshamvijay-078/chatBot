"""
graph.py — Penda Backend
The LangGraph workflow logic, extracted from the original backend.py.
The LLM is NO LONGER a module-level singleton — it is constructed
dynamically per-request so the correct API key (dev key vs BYOK) is used.
"""

from typing import TypedDict, Annotated
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

# Import tools from the sibling module
from tools import TOOLS


# ============================================================
# Chat Workflow State
# ============================================================

class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# ============================================================
# ATS Agent State
# ============================================================

class ATSState(TypedDict):
    resume_text: str
    job_description: str
    critique: str
    refined_bullets: str


# ============================================================
# Factory Functions
# These are called per-request so the right API key is injected.
# ============================================================

def build_llm(api_key: str, model: str = "llama-3.1-8b-instant") -> ChatGroq:
    """Construct a ChatGroq LLM with the provided API key and model."""
    return ChatGroq(api_key=api_key, model=model)


def build_chat_workflow(api_key: str, model: str = "llama-3.1-8b-instant"):
    """
    Compile and return the LangGraph chat workflow.
    Called once per request with the resolved API key.
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


def build_ats_workflow(api_key: str, model: str = "llama3-8b-8192"):
    """
    Compile and return the ATS resume optimization workflow.
    """
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
