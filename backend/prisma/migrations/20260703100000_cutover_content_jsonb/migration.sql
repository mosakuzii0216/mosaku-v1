-- Migration B: cutover_content_jsonb
-- 前提: content_json 全行充填済み（Task 5 移行パイプライン適用後）/ ローカルは空 DB reset 前提
--
-- down（ロールバック用 / 手動実行）:
--   ALTER TABLE "memos" ADD COLUMN "content_json" jsonb;
--   ALTER TABLE "notebooks" ADD COLUMN "content_json" jsonb;
--   ALTER TABLE "memos" ALTER COLUMN "content" TYPE text USING "content_html";
--   ALTER TABLE "notebooks" ALTER COLUMN "content" TYPE text USING "content_html";

BEGIN;

-- Step 1: 原本 HTML を content_html へ退避コピー（idempotent）
UPDATE "memos" SET "content_html" = "content" WHERE "content_html" IS NULL;
UPDATE "notebooks"
  SET "content_html" = "content"
  WHERE "content" IS NOT NULL AND "content_html" IS NULL;

-- Step 2: memos.content を in-place で JSONB 化（content_json を USING 参照）
ALTER TABLE "memos" ALTER COLUMN "content" TYPE jsonb USING "content_json";

-- Step 3: memos.content に NOT NULL 制約を付与
ALTER TABLE "memos" ALTER COLUMN "content" SET NOT NULL;

-- Step 4: staging 列 content_json を DROP
ALTER TABLE "memos" DROP COLUMN "content_json";

-- Step 5: notebooks.content を JSONB 化（NULL 許容を維持）
ALTER TABLE "notebooks" ALTER COLUMN "content" TYPE jsonb USING "content_json";

-- Step 6: notebooks の staging 列 DROP
ALTER TABLE "notebooks" DROP COLUMN "content_json";

COMMIT;
