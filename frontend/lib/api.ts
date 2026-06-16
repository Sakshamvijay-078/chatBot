/**
 * api.ts — Penda Frontend API Client
 * Typed wrappers around the FastAPI backend endpoints.
 */

import { Chat, Document, GroqModel, Message, Profile, SSEEvent } from "@/types";

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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────

export async function getProfile(token: string): Promise<Profile> {
  const res = await fetch(`${API_URL}/profile`, { headers: headers(token) });
  return handleResponse<Profile>(res);
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
  const res = await fetch(`${API_URL}/models`);
  const data = await handleResponse<{ models: GroqModel[] }>(res);
  return data.models;
}

// ─────────────────────────────────────────────────────────────
// Chats
// ─────────────────────────────────────────────────────────────

export async function listChats(token: string): Promise<Chat[]> {
  const res = await fetch(`${API_URL}/chats`, { headers: headers(token) });
  const data = await handleResponse<{ chats: Chat[] }>(res);
  return data.chats;
}

export async function createChat(token: string): Promise<string> {
  const res = await fetch(`${API_URL}/chats`, {
    method: "POST",
    headers: headers(token),
  });
  const data = await handleResponse<{ chat_id: string }>(res);
  return data.chat_id;
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
  const res = await fetch(`${API_URL}/chats/${chatId}/messages`, {
    headers: headers(token),
  });
  const data = await handleResponse<{ messages: Message[] }>(res);
  return data.messages;
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
        onEvent({ type: "error", message: b.detail ?? `HTTP ${res.status}` });
        return;
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
          try { onEvent(JSON.parse(raw) as SSEEvent); } catch { /* skip malformed */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        onEvent({ type: "error", message: err.message });
      }
    }
  })();

  return () => controller.abort();
}

// ─────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────

export async function listDocuments(token: string): Promise<Document[]> {
  const res = await fetch(`${API_URL}/documents`, { headers: headers(token) });
  const data = await handleResponse<{ documents: Document[] }>(res);
  return data.documents;
}

export async function uploadDocument(
  token: string,
  name: string,
  content: string
): Promise<Document> {
  const res = await fetch(`${API_URL}/documents`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ name, content }),
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
): Promise<{ critique: string; refined_bullets: string }> {
  const res = await fetch(`${API_URL}/ats`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ resume_text: resumeText, job_description: jobDescription }),
  });
  return handleResponse(res);
}
