# Penda Chatbot Project Summary

This document provides a comprehensive summary of the Penda Chatbot project, analyzing its architecture, core functionalities, and technical implementation based on the `/chatbot` directory.

## 1. High-Level Architecture
Penda is a full-stack, production-ready AI chat application. The application follows a modern decoupled architecture:
- **Backend:** A RESTful API built with **FastAPI** (Python).
- **Frontend:** A React application built with **Next.js 14**.
- **Database & Auth:** **Supabase** (PostgreSQL & Supabase Auth).
- **AI Core:** **LangGraph** & **LangChain** powered by **Groq** (running Llama 3.x models primarily).

## 2. Core Features & Capabilities
### A. Intelligent AI Assistant (LangGraph Workflow)
- Uses **LangGraph** to construct an agentic workflow consisting of an `assistant` node and a `tools` node.
- **Tool Use:** The LLM is equipped with tools (`tools.py`) to perform actions:
  - `calculator`: Evaluates mathematical expressions safely.
  - `web_search`: Uses DuckDuckGo to fetch real-time data with source URL citations.
  - `read_webpage`: Uses BeautifulSoup to scrape and parse webpage content.
- **Dynamic Context:** Injects long-term user facts, rolling summaries, recent messages, and uploaded documents directly into the prompt context.

### B. Streaming Responses
- The backend utilizes **Server-Sent Events (SSE)** via FastAPI's `StreamingResponse` to stream tokens in real-time (`/chat/stream`), providing a buttery smooth UX.
- The synchronous LangGraph stream is cleverly executed within a `ThreadPoolExecutor` to prevent blocking the async event loop.

### C. Advanced Memory Management
- **Rolling Summaries:** When a chat exceeds a specific token or message limit, older messages are compressed into a rolling summary, and old rows are deleted to save context space.
- **User Facts Extraction:** The LLM asynchronously extracts permanent facts from user messages (e.g., "I'm a Python dev") and saves them to a `user_memory` table for long-term personalization.

### D. Multi-Tiered User Access (Trial vs. BYOK)
- **Trial Mode:** Users utilize a default Dev Groq API key and have a strictly enforced token limit (e.g., 5000 tokens). Token accounting is managed via Supabase RPC.
- **BYOK (Bring Your Own Key):** Users can input their own Groq API key. The key is validated by making a minimal API call (`/profile/validate-key`) before being stored, bypassing trial limits and unlocking model selection.

### E. Security & Rate Limiting
- **Authentication:** Supabase Auth issues JWTs. The backend verifies these server-side via `Depends(get_current_user)`.
- **Sliding-Window Rate Limiter:** An in-memory, thread-safe rate limiter (`rate_limiter.py`) restricts spamming (e.g., max 15 requests/min for chat).

### F. Specialized ATS Agent
- A separate LangGraph workflow (`build_ats_workflow`) evaluates resumes against Job Descriptions.
- It is a 2-step pipeline: Critiques the resume (missing keywords) -> Refines and generates highly impactful bullet points.

### G. Document Support
- Users can upload global documents (text/PDF extracted). These are fetched and injected as system prompts per request.
- Inline documents (like PDFs uploaded mid-chat) are parsed on the fly via `fitz` (PyMuPDF) if encoded as base64.

## 3. Tech Stack Breakdown
**Backend (`/backend`)**
- `FastAPI`, `uvicorn`, `pydantic` (API framework and validation)
- `langgraph`, `langchain-groq`, `tiktoken` (AI workflows)
- `supabase` (Database and Auth client)
- `duckduckgo-search`, `beautifulsoup4` (Web Tools)

**Frontend (`/frontend`)**
- `Next.js 14`, `React 18`
- `TailwindCSS` (Styling), `Framer Motion` (Cinematic/spring physics animations)
- `@supabase/supabase-js`
- `react-markdown`, `react-syntax-highlighter` (Rendering AI responses)
