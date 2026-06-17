"""
tools.py — Penda Backend
LangChain @tool definitions:
  - calculator
  - web_search (DuckDuckGo) — now includes source URLs
  - read_webpage
"""

import requests
from bs4 import BeautifulSoup
from ddgs import DDGS
from langchain_core.tools import tool


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression. Input must be a valid Python math expression.
    Examples: '2 + 2', '(10 * 3) / 5', '2 ** 8', 'sqrt(144)' (use math functions).
    """
    import math
    try:
        allowed = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
        result = eval(expression, {"__builtins__": {}}, allowed)
        return str(result)
    except Exception as e:
        return f"Error: {e}"


@tool
def web_search(query: str) -> str:
    """Search the web using DuckDuckGo and return top results with their source URLs.
    Use this when you need current information or facts you don't know.
    Always cite the URLs in your response when using this tool.
    """
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=6))
        if not results:
            return "No results found."

        lines = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "")
            body  = r.get("body", "")
            url   = r.get("href", "")          # ← DuckDuckGo returns href as the URL
            lines.append(
                f"[{i}] {title}\n"
                f"URL: {url}\n"
                f"{body}"
            )
        return "\n\n".join(lines)
    except Exception as e:
        return f"Search failed: {e}"


@tool
def read_webpage(url: str) -> str:
    """Fetch and read the text content of a web page given its URL.
    Use this when the user shares a URL or you need to read a specific page.
    """
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
        # Return more content and include the source URL for citation
        snippet = text[:6000] + ("..." if len(text) > 6000 else "")
        return f"Source URL: {url}\n\n{snippet}"
    except Exception as e:
        return f"Failed to read page: {e}"


TOOLS = [calculator, web_search, read_webpage]
