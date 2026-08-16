-- Add effectKey to mori theme metadata for JS effect layer support
-- Existing metadata fields (version, category, variant, previewColor) are preserved
-- Old clients ignore effectKey, maintaining backward compatibility

UPDATE "themes"
SET "metadata" = "metadata" || '{"effectKey": "mori"}'::jsonb,
    "updatedAt" = NOW()
WHERE "id" = 'mori';
