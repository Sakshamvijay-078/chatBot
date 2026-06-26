-- ================================================================
-- schema_v3_minimal.sql
-- Minimal additive migration for the V3 backend upgrade.
--
-- ✅ If you already ran schema_v3.sql successfully → skip this file.
--    schema_v3.sql is a superset of this file.
--
-- Only run this if you want to skip the full schema_v3.sql
-- (e.g., no pgvector extension available) but still need the
-- core V3 columns and tables.
--
-- All statements are idempotent — safe to run multiple times.
-- ================================================================

-- ---------------------------------------------------------------
-- 1. Add V3 storage columns to existing `documents` table
-- ---------------------------------------------------------------
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type    TEXT,
  ADD COLUMN IF NOT EXISTS file_url     TEXT;

-- ---------------------------------------------------------------
-- 2. shared_chats table  (Share Chat feature)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shared_chats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id      UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  share_token  TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_chats_token   ON shared_chats(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_chats_chat_id ON shared_chats(chat_id);

ALTER TABLE shared_chats ENABLE ROW LEVEL SECURITY;

-- Use EXECUTE inside DO block so column refs are parsed as SQL, not PL/pgSQL vars
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shared_chats'
      AND policyname = 'Users manage their own shared chats'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users manage their own shared chats"
        ON shared_chats FOR ALL
        USING  (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. ats_candidates table  (ATS Dashboard feature)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ats_candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                  TEXT,
  email                 TEXT,
  resume_text           TEXT,
  job_description       TEXT,
  ats_score             INTEGER,
  missing_keywords      TEXT[] DEFAULT '{}',
  critique              TEXT,
  refined_bullets       TEXT,
  resume_storage_path   TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','analyzed','rejected','shortlisted','hired')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ats_candidates_user_id ON ats_candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_ats_candidates_status  ON ats_candidates(status);

ALTER TABLE ats_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ats_candidates'
      AND policyname = 'Users manage their own ATS candidates'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users manage their own ATS candidates"
        ON ats_candidates FOR ALL
        USING  (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- Done!
