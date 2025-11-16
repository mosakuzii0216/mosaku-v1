-- CSSファイル参照型テーマのためのスキーマ更新
-- stylesカラム → cssFilePathカラム + metadataカラム に変更
-- CSSファイルはフロントエンドの public/themes/ に配置

-- テーブル構造の変更
-- stylesカラムをNULL許可に変更
ALTER TABLE "themes" ALTER COLUMN "styles" DROP NOT NULL;

-- 新しいカラムを追加
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "css_file_path" VARCHAR(255);
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

DELETE FROM "themes" WHERE "isSystem" = true;

-- 既存のシステムテーマはこの時点では投入しない（後続のmigrationで5テーマを投入）
