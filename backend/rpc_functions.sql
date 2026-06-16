-- # Penda — SQL RPC Function for Atomic Token Counting
-- # Run this in Supabase SQL Editor AFTER running schema.sql

-- ============================================================
-- RPC: increment_trial_tokens
-- Called from Python to atomically add N tokens to a user's usage.
-- Using an RPC prevents race conditions vs. read-then-write.
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_trial_tokens(uid UUID, amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET trial_tokens_used = trial_tokens_used + amount,
        updated_at = NOW()
    WHERE id = uid;
END;
$$;


-- ============================================================
-- (Optional) Monthly reset cron via pg_cron
-- Uncomment if you enable the pg_cron extension in Supabase.
-- This resets everyone's trial token counter on the 1st of each month.
-- ============================================================
-- SELECT cron.schedule(
--     'reset-trial-tokens-monthly',
--     '0 0 1 * *',
--     $$UPDATE public.profiles SET trial_tokens_used = 0$$
-- );
