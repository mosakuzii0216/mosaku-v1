-- umi テーマに JS エフェクト(海底から昇る泡)を有効化する effectKey を付与
-- 既存メタデータ(previewColor / variant 等)は保持。
-- effectKey を解さない古いクライアントは無視するため後方互換。
UPDATE "themes"
SET "metadata" = "metadata" || '{"effectKey": "umi"}'::jsonb,
    "updatedAt" = NOW()
WHERE "id" = 'umi';
