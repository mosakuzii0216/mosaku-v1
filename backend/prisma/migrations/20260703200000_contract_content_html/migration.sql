-- Migration C: contract_content_html
-- ロールバック窓経過後に退避列 content_html を撤去する
-- 実行タイミング: cutover 後の稼働監視期間（rollback 窓）を経過し安定を確認した後

ALTER TABLE "memos" DROP COLUMN "content_html";
ALTER TABLE "notebooks" DROP COLUMN "content_html";
