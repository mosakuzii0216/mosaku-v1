-- Rename column notebook_name to name in notebooks table

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'notebooks' AND column_name = 'notebook_name'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'notebooks' AND column_name = 'name'
  ) THEN
    ALTER TABLE "notebooks" RENAME COLUMN "notebook_name" TO "name";
  END IF;
END $$;

-- Optional helpful indexes aligned with Prisma schema
CREATE INDEX IF NOT EXISTS "notebooks_userId_name_idx" ON "notebooks" ("user_id", "name");
CREATE INDEX IF NOT EXISTS "notebooks_userId_updatedAt_idx" ON "notebooks" ("user_id", "updatedAt");

