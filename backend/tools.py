"""
tools.py — Penda Backend
LangChain @tool definitions:
  - calculator (AST Secure)
  - web_search (DuckDuckGo with URLs)
  - read_webpage (SSRF Secure Scraper)
"""

import os
import ast
import math
import operator
import requests
import urllib.parse
from bs4 import BeautifulSoup
from ddgs import DDGS
from langchain_core.tools import tool

# ============================================================
# Calculator Tool Helpers (Safe AST Parsing)
# ============================================================

_ALLOWED_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,  
    ast.UAdd: operator.pos,
}

_ALLOWED_MATH_FUNCS = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}

def _evaluate_ast(node):
    """Recursively evaluate the AST safely."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
        
    elif isinstance(node, ast.UnaryOp):
        op_func = _ALLOWED_OPERATORS.get(type(node.op))
        if op_func:
            return op_func(_evaluate_ast(node.operand))
            
    elif isinstance(node, ast.BinOp):
        op_func = _ALLOWED_OPERATORS.get(type(node.op))
        if op_func:
            return op_func(_evaluate_ast(node.left), _evaluate_ast(node.right))
            
    elif isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id in _ALLOWED_MATH_FUNCS:
            math_func = _ALLOWED_MATH_FUNCS[node.func.id]
            args = [_evaluate_ast(arg) for arg in node.args]
            return math_func(*args)

    raise ValueError("Unsafe or unsupported mathematical operation")


# ============================================================
# Secure Tool Definitions
# ============================================================

@tool(description="Evaluate a mathematical expression. Input must be a valid Python math expression. Examples: '2 + 2', '(10 * 3) / 5', 'sqrt(144)'.")
def calculator(expression: str) -> str:
    try:
        tree = ast.parse(expression, mode='eval').body
        result = _evaluate_ast(tree)
        return str(result)
    except Exception:
        return "Error: Not able to calculate. Invalid syntax or operation."


@tool(description="Search the web using DuckDuckGo and return top results with their source URLs. Use this when you need current information or facts you don't know.")
def web_search(query: str) -> str:
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=6))
        if not results:
            return "No results found."

        lines = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "")
            body  = r.get("body", "")
            url   = r.get("href", "")  
            lines.append(
                f"[{i}] {title}\n"
                f"URL: {url}\n"
                f"{body}"
            )
        return "\n\n".join(lines)
    except Exception as e:
        return f"Search failed: {e}"


def is_safe_url(url: str) -> bool:
    """Check if URL targets internal network blocks to prevent SSRF attacks."""
    try:
        parsed = urllib.parse.urlparse(url)
        blocked_hostnames = ["localhost", "127.0.0.1", "169.254.169.254", "0.0.0.0"]
        if parsed.hostname in blocked_hostnames:
            return False
        if parsed.scheme not in ["http", "https"]:
            return False
        return True
    except Exception:
        return False


@tool(description="Fetch and read the text content of a web page given its URL. Use this when the user shares a specific URL link.")
def read_webpage(url: str) -> str:
    if not is_safe_url(url):
        return "Security Error: Blocked attempt to access internal or unsafe network resource."
        
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/115.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        snippet = text[:6000] + ("..." if len(text) > 6000 else "")
        return f"Source URL: {url}\n\n{snippet}"
    except Exception as e:
        return f"Failed to read page: {e}"


TOOLS = [calculator, web_search, read_webpage]