-- Create categories table and add category_id to themes

CREATE TABLE IF NOT EXISTS "categories" (
  "id" TEXT PRIMARY KEY,
  "name" VARCHAR(50) NOT NULL UNIQUE,
  "slug" VARCHAR(50) UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add category_id column to themes if it does not exist
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "category_id" TEXT;

-- Add foreign key constraint (SET NULL on delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'themes_category_id_fkey'
  ) THEN
    ALTER TABLE "themes" 
      ADD CONSTRAINT "themes_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Index for category_id
CREATE INDEX IF NOT EXISTS "themes_category_id_idx" ON "themes" ("category_id");

