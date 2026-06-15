from typing import TypedDict, Annotated
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from tools import TOOLS
import os

load_dotenv()

llm = ChatGroq(
    model="openai/gpt-oss-120b",
    api_key=os.getenv("GROQ_API_KEY"),
)

# Bind tools to the LLM so it can decide when to call them
llm_with_tools = llm.bind_tools(TOOLS)


class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


def assistant(state: ChatState):
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": [response]}


graph = StateGraph(ChatState)

graph.add_node("assistant", assistant)
graph.add_node("tools", ToolNode(TOOLS))

graph.add_edge(START, "assistant")
# If the LLM called a tool → run tools → back to assistant
# Otherwise → END
graph.add_conditional_edges("assistant", tools_condition)
graph.add_edge("tools", "assistant")

workflow = graph.compile()

# ==========================================
# PHASE 9: Agentic Workflow (ATS Checker)
# ==========================================

class ATSState(TypedDict):
    resume_text: str
    job_description: str
    critique: str
    refined_bullets: str

def ats_critique_node(state: ATSState):
    """Analyzes the resume against the JD and finds gaps."""
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
    """Takes the critique and actually writes the improvements."""
    prompt = (
        "You are a professional resume writer. Based on the following critique, "
        "write 3-5 highly impactful, action-oriented bullet points the user can directly paste into their resume "
        "to improve their ATS score. Use quantifiable metrics where possible.\n\n"
        f"Critique Context:\n{state['critique']}\n\n"
        f"Original Resume:\n{state['resume_text']}"
    )
    response = llm.invoke(prompt)
    return {"refined_bullets": response.content}

# Build the ATS Graph
ats_graph = StateGraph(ATSState)

ats_graph.add_node("critique", ats_critique_node)
ats_graph.add_node("refine", ats_refine_node)

ats_graph.add_edge(START, "critique")
ats_graph.add_edge("critique", "refine")
ats_graph.add_edge("refine", END)

ats_workflow = ats_graph.compile()