-- 新テーマ「sakura」「yuyake」「sumi」「neon」「wakaba」のカテゴリ登録
INSERT INTO "categories" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('sakura', '桜', 'sakura', NOW(), NOW()),
  ('yuyake', '夕焼け', 'yuyake', NOW(), NOW()),
  ('sumi', '墨', 'sumi', NOW(), NOW()),
  ('neon', 'ネオン', 'neon', NOW(), NOW()),
  ('wakaba', '若葉', 'wakaba', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 新テーマ「sakura」「yuyake」「sumi」「neon」「wakaba」の登録
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES
('sakura', '桜', '桜のような淡くやわらかな春のテーマ', true, true, 'sakura/sakura.css', '{"version":"1.0","category":"seasonal","variant":"spring","previewColor":"#fdf2f5"}', NOW(), NOW(), NULL),
('yuyake', '夕焼け', '夕焼けのような暖かく移ろう夕暮れのテーマ', true, true, 'yuyake/yuyake.css', '{"version":"1.0","category":"nature","variant":"sunset","previewColor":"#fff5ec"}', NOW(), NOW(), NULL),
('sumi', '墨', '墨と生成り紙のような和の渋みを湛えたテーマ', true, true, 'sumi/sumi.css', '{"version":"1.0","category":"vintage","variant":"ink","previewColor":"#f5f1e8"}', NOW(), NOW(), NULL),
('neon', 'ネオン', '漆黒の夜にシアンとマゼンタが灯る都市ネオンのテーマ', true, true, 'neon/neon.css', '{"version":"1.0","category":"city","variant":"neon","previewColor":"#0a0a12"}', NOW(), NOW(), NULL),
('wakaba', '若葉', '若葉のような瑞々しい新緑のテーマ', true, true, 'wakaba/wakaba.css', '{"version":"1.0","category":"nature","variant":"fresh-green","previewColor":"#f3f9ee"}', NOW(), NOW(), NULL)
ON CONFLICT ("id") DO NOTHING;

-- カテゴリとテーマを紐付け
UPDATE "themes" SET "category_id" = 'sakura', "updatedAt" = NOW() WHERE "css_file_path" = 'sakura/sakura.css';
UPDATE "themes" SET "category_id" = 'yuyake', "updatedAt" = NOW() WHERE "css_file_path" = 'yuyake/yuyake.css';
UPDATE "themes" SET "category_id" = 'sumi', "updatedAt" = NOW() WHERE "css_file_path" = 'sumi/sumi.css';
UPDATE "themes" SET "category_id" = 'neon', "updatedAt" = NOW() WHERE "css_file_path" = 'neon/neon.css';
UPDATE "themes" SET "category_id" = 'wakaba', "updatedAt" = NOW() WHERE "css_file_path" = 'wakaba/wakaba.css';
