-- CSSファイル参照型テーマプリセットデータを投入するmigration
-- stylesカラム → cssFilePathカラム + metadataカラム に変更
-- CSSファイルはフロントエンドの public/themes/ に配置

-- テーブル構造の変更
-- stylesカラムをNULL許可に変更
ALTER TABLE "themes" ALTER COLUMN "styles" DROP NOT NULL;

-- 新しいカラムを追加
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "css_file_path" VARCHAR(255);
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

-- 既存のシステムテーマを削除
DELETE FROM "themes" WHERE "isSystem" = true;

-- CSSファイル参照型テーマプリセットデータを投入
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('clean-white', 'クリーンホワイト', '汎用的でシンプルな白ベースのテーマ', true, true, 'clean-white.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('soft-gray', 'ソフトグレー', '目に優しいグレーベースのテーマ', true, true, 'soft-gray.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('dark-mode', 'ダークモード', '夜間作業に適したダークテーマ', true, true, 'dark-mode.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('natural-green', 'ナチュラルグリーン', '自然をイメージした癒しの緑テーマ', true, true, 'natural-green.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('warm-beige', 'ウォームベージュ', 'カフェのような温かみのあるベージュテーマ', true, true, 'warm-beige.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('professional', 'プロフェッショナル', 'ビジネス文書に適した洗練されたテーマ', true, true, 'professional.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('executive', 'エグゼクティブ', '重要な文書に適した格調高いテーマ', true, true, 'executive.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('study-blue', 'スタディブルー', '集中力を高める青ベースの学習テーマ', true, true, 'study-blue.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('academic', 'アカデミック', '研究・論文執筆に適したアカデミックテーマ', true, true, 'academic.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('artist', 'アーティスト', 'クリエイティブな発想を促す紫ベースのテーマ', true, true, 'artist.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('vintage', 'ヴィンテージ', 'レトロで温かみのあるヴィンテージテーマ', true, true, 'vintage.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('sakura-pink', 'サクラピンク', '春の桜をイメージした優雅なピンクテーマ', true, true, 'sakura-pink.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('ocean-blue', 'オーシャンブルー', '夏の海をイメージした爽やかなブルーテーマ', true, true, 'ocean-blue.css', '{"version":"1.0"}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('high-contrast', 'ハイコントラスト', '視覚的な識別性を重視したハイコントラストテーマ', true, true, 'high-contrast.css', '{"version":"1.0","accessibility":{"highContrast":true,"reducedMotion":true,"fontSize":"large"}}', NOW(), NOW(), NULL);
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES ('sepia-eye-care', 'セピア護眼', '目の疲れを軽減するセピア調テーマ', true, true, 'sepia-eye-care.css', '{"version":"1.0","accessibility":{"reducedMotion":true,"fontSize":"medium"}}', NOW(), NOW(), NULL);

-- 古いstylesカラムの削除（必要に応じて）
-- ALTER TABLE "themes" DROP COLUMN IF EXISTS "styles";

-- 15個のCSSファイル参照型テーマプリセットを投入しました
