-- Insert CSS-based themes from frontend/public/themes into themes table

-- Ensure columns exist
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "css_file_path" VARCHAR(255);
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}'::jsonb;

-- Remove existing records that would conflict by id or css_file_path
DELETE FROM "themes"
WHERE "id" IN ('ao','aka','ki','midori','siro','kuro','violet')
   OR "css_file_path" IN (
    'ao/ao.css',
    'aka/aka.css',
    'ki/ki.css',
    'midori/midori.css',
    'siro/siro.css',
    'kuro/kuro.css',
    'violet/violet.css'
);

-- Insert themes (CSS-file referenced)
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES
('ao','AO',NULL,true,true,'ao/ao.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#1C5DB6"}', NOW(), NOW(), NULL),
('aka','朱',NULL,true,true,'aka/aka.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#C53030"}', NOW(), NOW(), NULL),
('ki','Ki',NULL,true,true,'ki/ki.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#B45309"}', NOW(), NOW(), NULL),
('midori','緑',NULL,true,true,'midori/midori.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#15803D"}', NOW(), NOW(), NULL),
('siro','しろ',NULL,true,true,'siro/siro.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#1F2937"}', NOW(), NOW(), NULL),
('kuro','Kuro',NULL,true,true,'kuro/kuro.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#0F172A"}', NOW(), NOW(), NULL),
('violet','Violet',NULL,true,true,'violet/violet.css','{"version":"1.0","category":"basic","variant":"color-minimal","previewColor":"#6D28D9"}', NOW(), NOW(), NULL);

