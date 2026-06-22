# Penda Chatbot: Scope for Growth & Improvements

This document outlines the roadmap for making the Penda Chatbot a world-class, production-grade application. It covers architecture improvements, technical debt, new features, and bug fixes.

## 1. Architecture & Infrastructure Enhancements
### A. Vector Database (Advanced RAG)
- **Current State:** Documents are stored as raw text in a PostgreSQL table and fully injected into the prompt, up to an arbitrary cap.
- **Improvement:** Implement **pgvector** in Supabase (or Pinecone/Qdrant). Chunk documents on upload, generate embeddings, and perform semantic search. This will allow users to query massive PDFs (e.g., textbooks) without blowing up the context window.

### B. Distributed Rate Limiting
- **Current State:** The sliding window rate limiter is in-memory (`collections.deque`), which means limits are not shared across multiple workers/servers.
- **Improvement:** Migrate the rate limiter to **Redis**. This is mandatory if deploying on multiple workers (e.g., Kubernetes, Vercel edge functions, or Render with `workers > 1`).

### C. Async LLM Integration
- **Current State:** The backend uses the synchronous `workflow.stream()` wrapped in a `ThreadPoolExecutor` to stream responses.
- **Improvement:** Migrate LangGraph and LangChain calls to their native `async` equivalents (`astream`). This will reduce thread overhead, improve concurrent request handling, and make the FastAPI application truly asynchronous.

## 2. Feature Growth (Making it the "Best of All Time")
### A. Multi-Modal Capabilities (Vision & Audio)
- **Vision:** Integrate Llama 3.2 Vision (via Groq or separate endpoint) to allow users to upload images and ask questions about them.
- **Voice Mode:** Add WebRTC or WebSockets for real-time voice-to-voice chat, utilizing Whisper for STT and a fast TTS engine (like ElevenLabs or Cartesia).

### B. Extensible Plugin System
- **Current State:** Hardcoded tools (Calculator, Search, Reader).
- **Improvement:** Create an "App Store" of tools. Allow integrations with user accounts (e.g., "Connect GitHub" to read repos, "Connect Notion" to read/write docs, "Connect Google Calendar" to schedule events). 

### C. Advanced UI/UX (Frontend)
- **Code Execution:** Add a frontend component (like Sandpack) that can render React code or execute Python code directly in the browser when the AI generates it.
- **Artifacts:** Similar to Claude's Artifacts, render tables, diagrams (Mermaid), and UI components in a dedicated side-panel rather than inline text.
- **State Management:** Migrate complex React state to **Zustand** or Redux to prevent unnecessary re-renders.

### D. Monetization & Subscriptions
- Integrate **Stripe** to offer a "Pro" tier. Instead of relying solely on the BYOK (Bring Your Own Key) model, offer a subscription that provides generous limits on premium models (e.g., Llama 3.3 70B, GPT-4o) and features.

## 3. Bug Fixes & Technical Debt
### A. Error Handling in Streams
- **Bug Scope:** If an exception occurs deep inside the LangGraph workflow during streaming, the generator yields an error event but might leave the UI in a hanging state if not handled robustly on the frontend.
- **Fix:** Ensure the frontend gracefully closes the stream on `{"type": "error"}` and displays a user-friendly toast.

### B. PDF Text Extraction Fallbacks
- **Current State:** Base64 PDFs are decoded inline via `fitz` (PyMuPDF). If `fitz` fails, it returns a hardcoded error string.
- **Fix:** Use OCR (like Tesseract) as a fallback if the PDF is purely image-based (scanned documents). Currently, image-based PDFs will return empty text.

### C. Testing Suite
- **Current State:** No automated tests are visible in the codebase.
- **Fix:** Implement comprehensive testing:
  - **Backend:** `pytest` with `pytest-asyncio` for unit testing API routes, rate limiters, and mock LLM calls.
  - **Frontend:** `Jest` and `React Testing Library` for component tests, `Cypress` or `Playwright` for E2E testing (especially the auth flows and streaming chat).

## 4. Security
- Ensure `SUPABASE_SERVICE_KEY` is completely isolated from any client-facing code (currently good, but requires strict CI/CD checks).
- Implement strict payload sanitization to prevent prompt injection attacks, especially when the LLM reads external webpages via the `read_webpage` tool.
