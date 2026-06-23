-- ============================================================
-- PENDA — Supabase PostgreSQL Schema
-- Run this entire file in your Supabase SQL Editor once.
-- All tables are tied to auth.users via user_id (UUID).
-- ============================================================

-- Enable the uuid-ossp extension (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: profiles
-- One row per authenticated user. Stores LLM preferences
-- and the optional BYOK Groq API key (stored encrypted via pgcrypto
-- in production; stored as plain text here for simplicity).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    display_name  TEXT,
    style         TEXT DEFAULT 'Be concise and helpful.',
    expertise_level TEXT DEFAULT 'intermediate',
    -- BYOK: user's own Groq API key (nullable = trial mode)
    groq_api_key  TEXT DEFAULT NULL,
    -- Preferred Groq model when using BYOK
    preferred_model TEXT DEFAULT 'openai/gpt-oss-20b',
    -- Token usage counter for trial mode (resets monthly via a cron job)
    trial_tokens_used INTEGER DEFAULT 0,
    -- Max tokens allowed in trial mode before we reject the request
    trial_token_limit INTEGER DEFAULT 10000,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: each user can only read/write their own profile.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Automatically insert a new profile row when a user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ============================================================
-- TABLE: chats
-- One row per conversation session, linked to a user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chats (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    title      TEXT DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index to speed up "get all chats for user X" queries
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats (user_id, created_at DESC);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own chats"
    ON public.chats FOR ALL
    USING (auth.uid() = user_id);


-- ============================================================
-- TABLE: messages
-- Every individual message (human or AI) in a chat.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id         BIGSERIAL PRIMARY KEY,
    chat_id    UUID NOT NULL REFERENCES public.chats (id) ON DELETE CASCADE,
    -- 'user' | 'assistant' | 'system'
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content    TEXT NOT NULL,
    -- Token count for this specific message (used for trial accounting)
    token_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages (chat_id, id ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messages inherit access from their parent chat (user must own the chat)
CREATE POLICY "Users can CRUD messages in own chats"
    ON public.messages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = messages.chat_id
            AND chats.user_id = auth.uid()
        )
    );


-- ============================================================
-- TABLE: summaries
-- Stores the rolling LLM-generated summary for each chat
-- (mirrors the old SQLite summaries table, but keyed by chat UUID).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.summaries (
    chat_id    UUID PRIMARY KEY REFERENCES public.chats (id) ON DELETE CASCADE,
    summary    TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own summaries"
    ON public.summaries FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = summaries.chat_id
            AND chats.user_id = auth.uid()
        )
    );


-- ============================================================
-- TABLE: user_memory
-- Long-term facts about the user extracted from conversations.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_memory (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    fact        TEXT NOT NULL,
    importance  INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user_id ON public.user_memory (user_id, importance DESC);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own memory"
    ON public.user_memory FOR ALL
    USING (auth.uid() = user_id);
