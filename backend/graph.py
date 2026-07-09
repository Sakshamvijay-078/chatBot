from typing import AsyncGenerator, TypedDict, Annotated
from functools import lru_cache
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.runnables import RunnableConfig
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
        max_retries=0,      # Disable SDK retries to fail fast and prevent runaway delays
        timeout=30,         # 30s per LLM call; keeps tool loops from stalling
    )

# ============================================================
# Compiled workflow cache
# ============================================================
# The StateGraph compilation is expensive (it builds the full Pregel graph
# including all tool nodes). We cache compiled workflows keyed by
# (api_key, model) so the work is done exactly once per unique combination,
# not once per chat request.
#
# LRU size 32 is generous — most deployments will have only 1-2 unique
# api_key/model combos in production (dev key + a handful of BYOK keys).

@lru_cache(maxsize=32)
def _cached_chat_workflow(api_key: str, model: str):
    """Build and compile the chat workflow once per unique (api_key, model) pair."""
    llm = build_llm(api_key, model)

    fallback_models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    fallbacks = []
    for fm in fallback_models:
        if fm != model:
            fallbacks.append(build_llm(api_key, fm).bind_tools(TOOLS))

    llm_with_tools = llm.bind_tools(TOOLS).with_fallbacks(fallbacks)

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


@lru_cache(maxsize=32)
def _cached_ats_workflow(api_key: str, model: str):
    """Build and compile the ATS workflow once per unique (api_key, model) pair."""
    llm = build_llm(api_key, model)

    fallback_models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    fallbacks = []
    for fm in fallback_models:
        if fm != model:
            fallbacks.append(build_llm(api_key, fm))

    llm_with_fallbacks = llm.with_fallbacks(fallbacks)

    async def ats_critique_node(state: ATSState):
        prompt = (
            "You are an expert technical recruiter and an advanced ATS (Applicant Tracking System).\n"
            "Analyze the following resume against the Job Description.\n"
            "CRITICAL RULES:\n"
            "- Be highly intelligent about synonyms and context (e.g., 'AWS' = 'Amazon Web Services' = 'AWS-EC2', 'ReactJS' = 'React', 'Node' = 'Node.js').\n"
            "- Do not penalize for missing keywords if the candidate clearly demonstrates the exact same skill under a slightly different name.\n"
            "- Ignore capitalization and punctuation differences.\n\n"
            "TASKS:\n"
            "1. Give an estimated ATS match percentage.\n"
            "2. Identify exactly which required keywords or skills are missing, respecting the synonym rule.\n\n"
            f"Job Description:\n{state['job_description']}\n\n"
            f"Resume:\n{state['resume_text']}"
        )
        response = await llm_with_fallbacks.ainvoke(prompt)
        return {"critique": response.content}

    async def ats_refine_node(state: ATSState):
        prompt = (
            "You are a professional resume writer. Based on the following critique, "
            "write 3-5 highly impactful, action-oriented bullet points the user can directly paste into their resume "
            "to improve their ATS score. Use quantifiable metrics where possible.\n\n"
            f"Critique Context:\n{state['critique']}\n\n"
            f"Original Resume:\n{state['resume_text']}"
        )
        response = await llm_with_fallbacks.ainvoke(prompt)
        return {"refined_bullets": response.content}

    ats_graph = StateGraph(ATSState)
    ats_graph.add_node("critique", ats_critique_node)
    ats_graph.add_node("refine", ats_refine_node)
    ats_graph.add_edge(START, "critique")
    ats_graph.add_edge("critique", "refine")
    ats_graph.add_edge("refine", END)

    return ats_graph.compile()


# ============================================================
# Public API — kept unchanged so main.py doesn't need updates
# ============================================================

def build_chat_workflow(api_key: str, model: str = "llama-3.1-8b-instant"):
    """Returns a cached, compiled chat workflow."""
    return _cached_chat_workflow(api_key, model)


def build_ats_workflow(api_key: str, model: str = "llama-3.3-70b-versatile"):
    """Returns a cached, compiled ATS workflow."""
    return _cached_ats_workflow(api_key, model)


async def astream_chat_workflow(
    api_key: str,
    model: str,
    history: list,
) -> AsyncGenerator[tuple, None]:
    from langchain_core.messages import SystemMessage as _Sys
    # Inject file-writing instructions as a system prefix if not already present
    FILE_SYSTEM_PROMPT = _Sys(content=(
        "You are Penda, a helpful AI assistant. You have access to tools: web_search, calculator, read_webpage, write_file, read_file.\n\n"
        "EFFICIENCY RULES:\n"
        "1. Use web_search ONCE per response — combine all sub-questions into a single query.\n"
        "2. If you already know the answer, answer directly WITHOUT calling any tool.\n"
        "3. Keep your responses concise unless the user asks for detail.\n\n"
        "FILE CREATION: When asked to write/create any file (scripts, code, CSV, etc.), "
        "DO NOT use any tools. Just format it directly in your response using:\n```file:filename.ext\n<content>\n```\n"
        "This is strictly required. This renders a Download button in the UI."
    ))
    augmented = history
    if not history or not isinstance(history[0], _Sys):
        augmented = [FILE_SYSTEM_PROMPT] + list(history)

    # Use the cached compiled workflow — no rebuilding per request
    workflow = _cached_chat_workflow(api_key, model)
    # recursion_limit caps the assistant<->tool loop iterations
    config = RunnableConfig(recursion_limit=10)
    async for chunk, metadata in workflow.astream(
        {"messages": augmented}, stream_mode="messages", config=config
    ):
        yield chunk, metadata