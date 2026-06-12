from typing import TypedDict, Annotated
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
import os

load_dotenv()

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    api_key=os.getenv("GROQ_API_KEY"),
)

class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


def assistant(state: ChatState):
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

graph = StateGraph(ChatState)

graph.add_node("assistant", assistant)

graph.add_edge(START, "assistant")
graph.add_edge("assistant", END)

workflow = graph.compile()