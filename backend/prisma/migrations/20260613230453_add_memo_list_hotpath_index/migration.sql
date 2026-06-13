-- CreateIndex
-- メモ一覧/検索のホットパス（WHERE user_id = ? AND trashed_at IS NULL ORDER BY "updatedAt" DESC）と
-- ゴミ箱一覧（trashed_at IS NOT NULL）を同一インデックスで賄うための複合インデックス。
CREATE INDEX "memos_user_id_trashed_at_updatedAt_idx" ON "memos"("user_id", "trashed_at", "updatedAt" DESC);
