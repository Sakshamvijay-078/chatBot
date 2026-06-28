-- schema_v4_file_name.sql
-- Migration: add optional file_name column to messages table
-- This allows the UI to display an attachment chip on messages that
-- were sent with a document attached (like ChatGPT / Claude do).
--
-- Run this once in Supabase SQL Editor (or psql) before deploying
-- the backend code that uses the new column.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT NULL;

-- Index is not needed — this column is only used for display purposes
-- and is always fetched alongside the message row itself.
