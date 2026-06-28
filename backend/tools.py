"""
tools.py — Penda Backend
LangChain @tool definitions:
  - calculator (AST Secure)
  - web_search (DuckDuckGo with URLs)
  - read_webpage (SSRF Secure Scraper)
  - read_file (Supabase Storage)
  - create_file (Supabase Storage)
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

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or ""
)

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


import time as _time
_search_cache: dict[str, tuple[str, float]] = {}
_SEARCH_CACHE_TTL = 300  # 5 minutes

@tool(description="Search the web using DuckDuckGo and return top results with their source URLs. Use this when you need current information or facts you don't know. Combine multiple sub-questions into ONE query whenever possible.")
def web_search(query: str) -> str:
    """Search the web. Results are cached for 5 minutes to avoid redundant API calls."""
    # Normalise key
    cache_key = query.strip().lower()

    # Return cached result if fresh
    if cache_key in _search_cache:
        cached_result, ts = _search_cache[cache_key]
        if _time.monotonic() - ts < _SEARCH_CACHE_TTL:
            return f"[cached] {cached_result}"

    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=4))  # 4 is enough; fewer = faster
        if not results:
            return "No results found."

        lines = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "")
            body  = r.get("body", "")
            url   = r.get("href", "")
            lines.append(f"[{i}] {title}\nURL: {url}\n{body}")
        output = "\n\n".join(lines)

        # Cache the result
        _search_cache[cache_key] = (output, _time.monotonic())
        # Evict old entries if cache grows too large
        if len(_search_cache) > 200:
            oldest = sorted(_search_cache, key=lambda k: _search_cache[k][1])[:50]
            for k in oldest:
                del _search_cache[k]

        return output
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


@tool(
    description=(
        "Read the content of a file previously uploaded by the user. "
        "The 'path' argument must be a Supabase Storage path like 'user-id/filename.txt'. "
        "Use this when the user asks you to read, analyze, or summarize an uploaded file."
    )
)
def read_file(path: str) -> str:
    """Download and return text content of a file from Supabase Storage."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return "Error: Storage is not configured on this server."

    # Sanitize the path to prevent path traversal
    safe_path = path.lstrip("/").replace("..", "")
    if not safe_path:
        return "Error: Invalid file path."

    try:
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        content_bytes = client.storage.from_("documents").download(safe_path)
        
        # Try decoding as text
        try:
            text = content_bytes.decode("utf-8", errors="replace")
        except Exception:
            return f"Error: File at '{safe_path}' is not a readable text file."
        
        # Truncate to a reasonable size for LLM context
        snippet = text[:8000] + ("...[truncated]" if len(text) > 8000 else "")
        return f"File: {safe_path}\n\n{snippet}"
    except Exception as e:
        return f"Error reading file '{safe_path}': {str(e)}"


@tool(
    description=(
        "Create a downloadable file for the user with any content. "
        "Use this whenever the user asks to 'write a file', 'generate a script', 'create a .py/.txt/.cpp/etc file', or wants to download code/text. "
        "Provide 'filename' (e.g. 'solution.py', 'README.md', 'data.csv') and 'content' (the full file text). "
        "The file will appear in the chat as a downloadable card. "
        "IMPORTANT: After calling this tool, you MUST output the file content in your response using the exact format:\n"
        "```file:filename\n"
        "<content>\n"
        "```\n"
        "This renders a download button in the UI."
    )
)
def write_file(filename: str, content: str) -> str:
    """
    Signal to the LLM to render a downloadable file card in the chat.
    Returns the markdown block the LLM should include verbatim in its final response.
    """
    # Sanitize filename
    safe_name = filename.lstrip("/").replace("..", "").replace("/", "_").strip()
    if not safe_name:
        return "Error: Invalid filename."

    # Return the exact markdown block the frontend GeneratedFileCard parser expects.
    # The LLM must copy this into its response text.
    return (
        f"FILE_READY:{safe_name}\n"
        f"Include this exact block in your response:\n"
        f"```file:{safe_name}\n{content}\n```"
    )


@tool(
    description=(
        "Create a new text file and save it to the user's document storage in Supabase. "
        "Provide a 'filename' (e.g., 'report.md') and 'content' (the file text). "
        "Returns the storage path of the created file."
    )
)
def create_file(filename: str, content: str, user_id: str = "ai-generated") -> str:
    """Write text content to a new file in Supabase Storage."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return "Error: Storage is not configured on this server."

    safe_name = filename.lstrip("/").replace("..", "").replace("/", "_")
    if not safe_name:
        return "Error: Invalid filename."

    storage_path = f"{user_id}/{safe_name}"

    try:
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        content_bytes = content.encode("utf-8")
        client.storage.from_("documents").upload(
            storage_path,
            content_bytes,
            {"content-type": "text/plain", "upsert": "true"},
        )
        return f"File '{safe_name}' created successfully at storage path: {storage_path}"
    except Exception as e:
        return f"Error creating file '{safe_name}': {str(e)}"


TOOLS = [calculator, web_search, read_webpage, read_file, write_file, create_file]