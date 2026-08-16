-- yoru / asa テーマに JS エフェクトの effectKey を付与
--   yoru = たまに流れる流れ星 / asa = 朝の光の中を漂う光粒
-- 既存メタデータは保持。effectKey を解さない古いクライアントは無視するため後方互換。
UPDATE "themes"
SET "metadata" = "metadata" || '{"effectKey": "yoru"}'::jsonb,
    "updatedAt" = NOW()
WHERE "id" = 'yoru';

UPDATE "themes"
SET "metadata" = "metadata" || '{"effectKey": "asa"}'::jsonb,
    "updatedAt" = NOW()
WHERE "id" = 'asa';
