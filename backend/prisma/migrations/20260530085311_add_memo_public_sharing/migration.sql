-- AlterTable
ALTER TABLE "memos" ADD COLUMN     "public_token" VARCHAR(64),
ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "memos_public_token_key" ON "memos"("public_token");

-- CreateIndex
CREATE INDEX "memos_user_id_published_at_idx" ON "memos"("user_id", "published_at" DESC);
