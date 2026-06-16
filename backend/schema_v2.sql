-- ============================================================
-- schema_v2.sql — Penda: Documents table
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- chat_id IS NULL  →  global document (visible in every chat for this user)
  -- chat_id IS SET   →  reserved for future per-chat DB storage
  chat_id    UUID        REFERENCES chats(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  size_bytes INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_chat_id ON documents(chat_id);

-- RLS: users can only see/mutate their own documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);
