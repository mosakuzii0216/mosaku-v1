-- Create join table for notebooks and tags
CREATE TABLE IF NOT EXISTS "notebook_tags" (
    "notebook_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    CONSTRAINT "notebook_tags_pkey" PRIMARY KEY ("notebook_id", "tag_id"),
    CONSTRAINT "notebook_tags_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notebook_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Optional indexes for faster lookups
CREATE INDEX IF NOT EXISTS "notebook_tags_notebook_id_idx" ON "notebook_tags" ("notebook_id");
CREATE INDEX IF NOT EXISTS "notebook_tags_tag_id_idx" ON "notebook_tags" ("tag_id");

