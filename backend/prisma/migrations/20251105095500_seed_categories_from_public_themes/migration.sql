-- Seed categories derived from frontend/public/themes and link themes

-- Insert categories for each CSS theme slug (id = slug)
INSERT INTO "categories" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('ao', 'AO', 'ao', NOW(), NOW()),
  ('aka', '朱', 'aka', NOW(), NOW()),
  ('ki', 'Ki', 'ki', NOW(), NOW()),
  ('midori', '緑', 'midori', NOW(), NOW()),
  ('siro', 'しろ', 'siro', NOW(), NOW()),
  ('kuro', 'Kuro', 'kuro', NOW(), NOW()),
  ('violet', 'Violet', 'violet', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Link themes to these categories based on css_file_path
UPDATE "themes" SET "category_id" = 'ao', "updatedAt" = NOW() WHERE "css_file_path" = 'ao/ao.css';
UPDATE "themes" SET "category_id" = 'aka', "updatedAt" = NOW() WHERE "css_file_path" = 'aka/aka.css';
UPDATE "themes" SET "category_id" = 'ki', "updatedAt" = NOW() WHERE "css_file_path" = 'ki/ki.css';
UPDATE "themes" SET "category_id" = 'midori', "updatedAt" = NOW() WHERE "css_file_path" = 'midori/midori.css';
UPDATE "themes" SET "category_id" = 'siro', "updatedAt" = NOW() WHERE "css_file_path" = 'siro/siro.css';
UPDATE "themes" SET "category_id" = 'kuro', "updatedAt" = NOW() WHERE "css_file_path" = 'kuro/kuro.css';
UPDATE "themes" SET "category_id" = 'violet', "updatedAt" = NOW() WHERE "css_file_path" = 'violet/violet.css';

