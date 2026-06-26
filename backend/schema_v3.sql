-- ============================================================
-- PENDA — Schema V3 Migration
-- Run in Supabase SQL Editor AFTER schema.sql has been applied.
-- Adds: pgvector RAG, Supabase Storage references, shared chats,
--       and ATS candidates table.
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- TABLE: documents — add storage_path column
-- Migrate from storing content blobs in PG to Supabase Storage.
-- New uploads will set storage_path; content column kept for
-- backwards compat with old rows.
-- ============================================================
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS storage_path TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS file_url TEXT DEFAULT NULL;

-- ============================================================
-- TABLE: document_chunks
-- Stores text chunks + vector embeddings for RAG retrieval.
-- Each document is split into chunks; each chunk has an embedding.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id          BIGSERIAL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    embedding   vector(1536),         -- OpenAI text-embedding-3-small dim
    chunk_index INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbor search
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding
    ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_user_id
    ON public.document_chunks (user_id);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own document chunks"
    ON public.document_chunks FOR ALL
    USING (auth.uid() = user_id);


-- ============================================================
-- TABLE: shared_chats
-- Stores public share tokens that allow read-only access to a chat.
-- Anyone with the token can view, but cannot modify.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shared_chats (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id      UUID NOT NULL REFERENCES public.chats (id) ON DELETE CASCADE,
    share_token  TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
    created_by   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    -- Optional: expiry for shared links (NULL = never expires)
    expires_at   TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_chats_token
    ON public.shared_chats (share_token);

CREATE INDEX IF NOT EXISTS idx_shared_chats_chat_id
    ON public.shared_chats (chat_id);

ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;

-- Owner can create/delete shares for their own chats
CREATE POLICY "Chat owners can manage shares"
    ON public.shared_chats FOR ALL
    USING (
        auth.uid() = created_by
    );

-- Public read access via share token (backend service key handles this)
-- No public RLS policy needed — backend uses service role to query by token.


-- ============================================================
-- TABLE: ats_candidates
-- Stores parsed resume data and ATS analysis results.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ats_candidates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    name            TEXT,
    email           TEXT,
    resume_storage_path TEXT,              -- Supabase Storage path to original resume
    resume_text     TEXT,                  -- Extracted plain text
    job_description TEXT,
    ats_score       INTEGER,               -- 0-100
    missing_keywords TEXT[],
    critique        TEXT,
    refined_bullets TEXT,
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'analyzed', 'rejected', 'shortlisted', 'hired')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ats_candidates_user_id
    ON public.ats_candidates (user_id, created_at DESC);

ALTER TABLE public.ats_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own ATS candidates"
    ON public.ats_candidates FOR ALL
    USING (auth.uid() = user_id);


-- ============================================================
-- RPC: match_document_chunks
-- Used for RAG: returns the top-k chunks most similar to a query
-- embedding, for the authenticated user's documents.
-- ============================================================
CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding vector(1536),
    match_user_id   UUID,
    match_count     INT DEFAULT 5,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id          BIGINT,
    document_id UUID,
    content     TEXT,
    similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM public.document_chunks dc
    WHERE
        dc.user_id = match_user_id
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
$$;


-- ============================================================
-- Supabase Storage Buckets
-- Run these via the Supabase Dashboard > Storage, or via API.
-- SQL cannot create buckets directly, but we document them here.
-- Buckets to create manually in the Supabase dashboard:
--   1. "documents"  — private, max 50MB, allowed: pdf, txt, docx, png, jpg
--   2. "ats-resumes" — private, max 20MB, allowed: pdf, docx
-- ============================================================

-- ============================================================
-- Ensure the documents table has the right structure
-- (if it was created by schema.sql without content column)
-- ============================================================
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';
