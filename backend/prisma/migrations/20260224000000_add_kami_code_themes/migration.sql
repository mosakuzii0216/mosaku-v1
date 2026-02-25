-- 新テーマ「kami」「code」のカテゴリ登録
INSERT INTO "categories" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('kami', '紙', 'kami', NOW(), NOW()),
  ('code', 'Code', 'code', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 新テーマ「kami」「code」の登録
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES
('kami', '紙', '紙のノートのような温かみのあるテーマ', true, true, 'kami/kami.css', '{"version":"1.0","category":"style","variant":"paper","previewColor":"#faf8f3"}', NOW(), NOW(), NULL),
('code', 'Code', 'VSCode風のコードエディタテーマ', true, true, 'code/code.css', '{"version":"1.0","category":"style","variant":"code-editor","previewColor":"#1e1e1e"}', NOW(), NOW(), NULL)
ON CONFLICT ("id") DO NOTHING;

-- カテゴリとテーマを紐付け
UPDATE "themes" SET "category_id" = 'kami', "updatedAt" = NOW() WHERE "css_file_path" = 'kami/kami.css';
UPDATE "themes" SET "category_id" = 'code', "updatedAt" = NOW() WHERE "css_file_path" = 'code/code.css';
