// Shared TypeScript types for Penda frontend

export interface User {
  id: string;
  email: string;
  full_name?: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  style: string;
  expertise_level: string;
  preferred_model: string;
  has_byok: boolean;
  trial_tokens_used: number;
  trial_token_limit: number;
}

export interface Chat {
  id: string;
  title: string;
  created_at: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  file_url?: string;
  file_name?: string;
  mime_type?: string;
}

export interface Document {
  id: string;
  name: string;
  size_bytes: number;
  chat_id: string | null;   // null = global
  created_at: string;
  storage_path?: string;
  mime_type?: string;
  file_url?: string;
}

export interface GroqModel {
  id: string;
  name: string;
}

// SSE event types emitted by /chat/stream
export type SSEEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; tool: string }
  | { type: "done"; total_tokens: number }
  | { type: "error"; message: string };

// A pending (not yet sent) document attached via the paperclip button
export interface PendingDocument {
  name: string;
  content: string;  // extracted plain text, client-side
  size: number;     // bytes
  previewUrl?: string; // Object URL for image preview
}

// Share Chat
export interface ShareChatResponse {
  share_token: string;
  share_url: string;
}

// ATS Candidates
export type ATSStatus = "pending" | "analyzed" | "rejected" | "shortlisted" | "hired";

export interface ATSCandidate {
  id: string;
  name: string | null;
  email: string | null;
  ats_score: number | null;
  status: ATSStatus;
  created_at: string;
  missing_keywords: string[];
}

export interface ATSCandidateDetail extends ATSCandidate {
  resume_text: string;
  job_description: string;
  critique: string;
  refined_bullets: string;
  resume_storage_path: string | null;
}

export interface ATSResult {
  critique: string;
  refined_bullets: string;
}
