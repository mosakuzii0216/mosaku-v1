-- Rename supabase_id column to oauth_id
ALTER TABLE "users" RENAME COLUMN "supabase_id" TO "oauth_id";