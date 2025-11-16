-- Insert CSS-based themes from frontend/public/themes into themes table

-- Ensure columns exist
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "css_file_path" VARCHAR(255);
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb;

DELETE FROM "themes"
WHERE "id" IN ('ao','aka','midori','mori','kuro','siro')
   OR "css_file_path" IN (
    'ao/ao.css',
    'aka/aka.css',
    'midori/midori.css',
    'mori/mori.css',
    'siro/siro.css',
    'kuro/kuro.css'
);

-- Ensure only the desired 5 system themes exist
DELETE FROM "themes"
WHERE "isSystem" = true AND "id" NOT IN ('ao','aka','mori','kuro','siro');

-- Insert themes (CSS-file referenced)
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES
('ao','AO',NULL,true,true,'ao/ao.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#1C5DB6"}', NOW(), NOW(), NULL),
('aka','朱',NULL,true,true,'aka/aka.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#C53030"}', NOW(), NOW(), NULL),
('mori','森',NULL,true,true,'mori/mori.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#15803D"}', NOW(), NOW(), NULL),
('kuro','Kuro',NULL,true,true,'kuro/kuro.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#0F172A"}', NOW(), NOW(), NULL),
('siro','しろ',NULL,true,true,'siro/siro.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#1F2937"}', NOW(), NOW(), NULL);
