-- 和の4テーマ（mori / umi / yoru / asa）にキュレーション
--   1. 新テーマ yoru / asa を追加（CSS は frontend/public/themes/{yoru,asa}/ に実装済み）
--   2. umi のメタデータを「深い海中」リデザインに合わせて更新
--   3. 他13テーマを削除
-- 削除時の依存:
--   - notebooks.theme_id … ON DELETE SET NULL（使用中ノートは自動でテーマ無しに戻る）
--   - user_favorite_themes.theme_id … ON DELETE CASCADE（お気に入りは自動削除）
--   - memos.theme_id … 既に廃止済み（無関係）

-- 1a. カテゴリ追加（yoru / asa）
INSERT INTO "categories" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('yoru', '夜', 'yoru', NOW(), NOW()),
  ('asa', '朝', 'asa', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 1b. テーマ追加（yoru / asa）
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES
('yoru', '夜', '墨のような静寂の夜。和・ミニマル・内省のテーマ', true, true, 'yoru/yoru.css', '{"version":"1.0","category":"nature","variant":"ink-night","previewColor":"#0d1b2a"}', NOW(), NOW(), NULL),
('asa', '朝', '夜明けの朝焼け。希望と始まりのテーマ', true, true, 'asa/asa.css', '{"version":"1.0","category":"nature","variant":"dawn","previewColor":"#ffd9c0"}', NOW(), NOW(), NULL)
ON CONFLICT ("id") DO NOTHING;

-- 1c. カテゴリ紐付け
UPDATE "themes" SET "category_id" = 'yoru', "updatedAt" = NOW() WHERE "css_file_path" = 'yoru/yoru.css';
UPDATE "themes" SET "category_id" = 'asa', "updatedAt" = NOW() WHERE "css_file_path" = 'asa/asa.css';

-- 2. umi メタデータ更新（深い海中リデザイン：説明文と previewColor / variant）
UPDATE "themes"
SET "description" = '海に潜るような、深く静かな没入の海テーマ',
    "metadata" = "metadata" || '{"previewColor":"#013a63","variant":"deep-ocean"}'::jsonb,
    "updatedAt" = NOW()
WHERE "id" = 'umi';

-- 3. 他13テーマを削除（mori / umi / yoru / asa 以外）
DELETE FROM "themes" WHERE "id" IN
  ('aka','ao','code','kami','kuro','neon','sakura','siro','sumi','tsuki','wakaba','yuki','yuyake');

-- 4. 削除テーマに対応するカテゴリも掃除（残す4テーマのカテゴリには触れない）
DELETE FROM "categories" WHERE "id" IN
  ('aka','ao','code','kami','kuro','neon','sakura','siro','sumi','tsuki','wakaba','yuki','yuyake');
