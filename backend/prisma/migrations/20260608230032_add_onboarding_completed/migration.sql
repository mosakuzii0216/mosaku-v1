-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboarding_completed" BOOLEAN NOT NULL DEFAULT false;

-- NOTE: 既存ユーザー向け手動 SQL（リリース後に実行すること）
-- 本マイグレーション適用後、リリース日以前に登録した既存ユーザーは
-- onboarding_completed = false になるため、以下の SQL を手動実行してください:
--
-- UPDATE users SET onboarding_completed = true WHERE created_at < '2026-06-10T00:00:00Z';
