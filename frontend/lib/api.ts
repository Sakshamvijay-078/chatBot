/**
 * api.ts — Penda Frontend API Client
 * Typed wrappers around the FastAPI backend endpoints.
 * Includes a retry mechanism with exponential backoff (up to 5 attempts).
 */

import { Chat, Document, GroqModel, Message, Profile, SSEEvent, ShareChatResponse, ATSCandidate, ATSCandidateDetail, ATSResult } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function headers(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail ?? `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry wrapper with exponential backoff.
 * Retries up to `maxAttempts` (default 5) on failure.
 * If all attempts fail, throws a user-friendly error.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  label = "request",
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      // Fail fast on auth errors
      if (err?.status === 401 || err?.status === 403) {
        throw err;
      }
      if (i < maxAttempts - 1) {
        const delay = 500 * Math.pow(2, i);
        console.warn(`[retry] ${label} failed (attempt ${i + 1}/${maxAttempts}), retrying in ${delay}ms:`, err);
        await sleep(delay);
      }
    }
  }
  console.error(`[retry] ${label} failed after ${maxAttempts} attempts`);
  throw new Error(
    "The server is currently unavailable. Please try again in a moment.",
  );
}

// ─────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────

export async function getProfile(token: string): Promise<Profile> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/profile`, { headers: headers(token) });
    return handleResponse<Profile>(res);
  }, 3, "getProfile");
}

export async function updateProfile(
  token: string,
  updates: Partial<{
    display_name: string;
    style: string;
    expertise_level: string;
    groq_api_key: string;
    preferred_model: string;
  }>
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/profile`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

export async function validateGroqKey(
  token: string,
  apiKey: string
): Promise<{ valid: boolean; message: string }> {
  const res = await fetch(`${API_URL}/profile/validate-key`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ api_key: apiKey }),
  });
  return handleResponse(res);
}

export async function removeGroqKey(token: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/profile/key`, {
    method: "DELETE",
    headers: headers(token),
  });
  return handleResponse(res);
}

// ─────────────────────────────────────────────────────────────
// Models
// ─────────────────────────────────────────────────────────────

export async function getModels(): Promise<GroqModel[]> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/models`);
    const data = await handleResponse<{ models: GroqModel[] }>(res);
    return data.models;
  }, 3, "getModels");
}

// ─────────────────────────────────────────────────────────────
// Chats
// ─────────────────────────────────────────────────────────────

export async function listChats(token: string): Promise<Chat[]> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/chats`, { headers: headers(token) });
    const data = await handleResponse<{ chats: Chat[] }>(res);
    return data.chats;
  }, 5, "listChats");
}

export async function createChat(token: string): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/chats`, {
      method: "POST",
      headers: headers(token),
    });
    const data = await handleResponse<{ chat_id: string }>(res);
    return data.chat_id;
  }, 5, "createChat");
}

export async function deleteChat(token: string, chatId: string): Promise<void> {
  await fetch(`${API_URL}/chats/${chatId}`, {
    method: "DELETE",
    headers: headers(token),
  });
}

export async function getChatMessages(
  token: string,
  chatId: string
): Promise<Message[]> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/chats/${chatId}/messages`, {
      headers: headers(token),
    });
    const data = await handleResponse<{ messages: Message[] }>(res);
    return data.messages;
  }, 5, "getChatMessages");
}

// Share chat
export async function shareChat(
  token: string,
  chatId: string,
): Promise<ShareChatResponse> {
  const res = await fetch(`${API_URL}/chats/${chatId}/share`, {
    method: "POST",
    headers: headers(token),
  });
  return handleResponse<ShareChatResponse>(res);
}

// Public shared chat (no auth)
export async function getSharedChat(shareToken: string): Promise<{
  title: string;
  messages: Message[];
  chat_id: string;
}> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/share/${shareToken}`);
    return handleResponse(res);
  }, 3, "getSharedChat");
}

// ─────────────────────────────────────────────────────────────
// Streaming Chat
// ─────────────────────────────────────────────────────────────

export function streamChat(
  token: string,
  chatId: string,
  message: string,
  onEvent: (event: SSEEvent) => void,
  docContent?: string,
  docName?: string,
): () => void {
  const controller = new AbortController();

  (async () => {
    let attempt = 0;
    const maxAttempts = 5;

    while (attempt < maxAttempts) {
      try {
        const body: Record<string, unknown> = { chat_id: chatId, message };
        if (docContent) { body.doc_content = docContent; body.doc_name = docName ?? "document"; }

        const res = await fetch(`${API_URL}/chat/stream`, {
          method: "POST",
          headers: headers(token),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          // Don't retry 4xx errors — those are client errors
          if (res.status >= 400 && res.status < 500) {
            onEvent({ type: "error", message: b.detail ?? `HTTP ${res.status}` });
            return;
          }
          throw new Error(b.detail ?? `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) { onEvent({ type: "error", message: "No response stream." }); return; }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            let parsed: SSEEvent | null = null;
            try { parsed = JSON.parse(raw) as SSEEvent; } catch { /* skip malformed */ }
            if (!parsed) continue;
            onEvent(parsed);
            if (parsed.type === "error" || parsed.type === "done") {
              reader.cancel();
              return;
            }
          }
        }
        return; // success — exit retry loop
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;

        attempt++;
        if (attempt >= maxAttempts) {
          onEvent({
            type: "error",
            message: "The server is currently unavailable. Please try again in a moment.",
          });
          return;
        }

        const delay = 500 * Math.pow(2, attempt - 1);
        console.warn(`[streamChat retry] attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  })();

  return () => controller.abort();
}

// ─────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────

export async function listDocuments(token: string): Promise<Document[]> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/documents`, { headers: headers(token) });
    const data = await handleResponse<{ documents: Document[] }>(res);
    return data.documents;
  }, 3, "listDocuments");
}

export async function uploadDocument(
  token: string,
  file: File,
): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/documents`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  return handleResponse<Document>(res);
}

export async function removeDocument(token: string, docId: string): Promise<void> {
  await fetch(`${API_URL}/documents/${docId}`, {
    method: "DELETE",
    headers: headers(token),
  });
}

// ─────────────────────────────────────────────────────────────
// ATS Agent
// ─────────────────────────────────────────────────────────────

export async function runATS(
  token: string,
  resumeText: string,
  jobDescription: string
): Promise<ATSResult> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/ats`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ resume_text: resumeText, job_description: jobDescription }),
    });
    return handleResponse<ATSResult>(res);
  }, 5, "runATS");
}

export async function uploadATSResume(
  token: string,
  file: File,
): Promise<{ resume_text: string; storage_path: string | null; filename: string }> {
  return withRetry(async () => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/ats/upload`, {
      method: "POST",
      headers: authHeaders(token),
      body: formData,
    });
    return handleResponse(res);
  }, 3, "uploadATSResume");
}

export async function listATSCandidates(token: string): Promise<ATSCandidate[]> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/ats/candidates`, { headers: headers(token) });
    const data = await handleResponse<{ candidates: ATSCandidate[] }>(res);
    return data.candidates;
  }, 3, "listATSCandidates");
}

export async function getATSCandidateDetail(
  token: string,
  candidateId: string,
): Promise<ATSCandidateDetail> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/ats/candidates/${candidateId}`, {
      headers: headers(token),
    });
    return handleResponse<ATSCandidateDetail>(res);
  }, 3, "getATSCandidateDetail");
}

export async function updateATSCandidateStatus(
  token: string,
  candidateId: string,
  status: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/ats/candidates/${candidateId}/status`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ status }),
  });
  await handleResponse(res);
}

export async function deleteATSCandidate(
  token: string,
  candidateId: string,
): Promise<void> {
  await fetch(`${API_URL}/ats/candidates/${candidateId}`, {
    method: "DELETE",
    headers: headers(token),
  });
}
