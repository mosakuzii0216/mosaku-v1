-- 新テーマ「umi」「tsuki」「yuki」のカテゴリ登録
INSERT INTO "categories" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('umi', '海', 'umi', NOW(), NOW()),
  ('tsuki', '月', 'tsuki', NOW(), NOW()),
  ('yuki', '雪', 'yuki', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 新テーマ「umi」「tsuki」「yuki」の登録
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES
('umi', '海', '海のような深く静かなテーマ', true, true, 'umi/umi.css', '{"version":"1.0","category":"nature","variant":"ocean","previewColor":"#e8f4f8"}', NOW(), NOW(), NULL),
('tsuki', '月', '月夜のような深い夜空と静謐なテーマ', true, true, 'tsuki/tsuki.css', '{"version":"1.0","category":"dark","variant":"night","previewColor":"#0d1b2a"}', NOW(), NOW(), NULL),
('yuki', '雪', '雪のような清潔で凛とした冬のテーマ', true, true, 'yuki/yuki.css', '{"version":"1.0","category":"seasonal","variant":"winter","previewColor":"#f7f9fc"}', NOW(), NOW(), NULL)
ON CONFLICT ("id") DO NOTHING;

-- カテゴリとテーマを紐付け
UPDATE "themes" SET "category_id" = 'umi', "updatedAt" = NOW() WHERE "css_file_path" = 'umi/umi.css';
UPDATE "themes" SET "category_id" = 'tsuki', "updatedAt" = NOW() WHERE "css_file_path" = 'tsuki/tsuki.css';
UPDATE "themes" SET "category_id" = 'yuki', "updatedAt" = NOW() WHERE "css_file_path" = 'yuki/yuki.css';
