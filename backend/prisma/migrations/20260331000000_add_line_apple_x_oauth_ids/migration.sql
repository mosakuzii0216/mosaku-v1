-- AlterTable: LINE・Apple・X OAuth ID フィールドを users テーブルに追加
ALTER TABLE "users" ADD COLUMN "line_id" TEXT;
ALTER TABLE "users" ADD COLUMN "apple_id" TEXT;
ALTER TABLE "users" ADD COLUMN "x_id" TEXT;

-- CreateIndex: 各フィールドにユニーク制約を追加
CREATE UNIQUE INDEX "users_line_id_key" ON "users"("line_id");
CREATE UNIQUE INDEX "users_apple_id_key" ON "users"("apple_id");
CREATE UNIQUE INDEX "users_x_id_key" ON "users"("x_id");
