-- マイグレーション前検証: PREMIUM ロールを持つユーザーが存在しないことを確認
-- 実行前に手動で確認: SELECT count(*) FROM "users" WHERE role::text = 'PREMIUM';
-- 結果が 0 件であることを確認してから適用すること

-- 1. 新しい enum を作成
CREATE TYPE "UserRole_new" AS ENUM ('USER', 'ADMIN');

-- 2. カラムを新しい enum に変換（FREE→USER, ADMIN→ADMIN）
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE role::text
      WHEN 'FREE'  THEN 'USER'::"UserRole_new"
      WHEN 'ADMIN' THEN 'ADMIN'::"UserRole_new"
    END
  );

-- 3. デフォルト値を再設定
ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole_new";

-- 4. 旧 enum を削除して新 enum をリネーム
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
