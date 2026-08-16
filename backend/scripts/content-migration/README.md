# content-migration パイプライン

HTML→JSON 本文移行の 3 ステージパイプライン。**maintenance window（書込フリーズ窓）内で実行**。

## 前提

- Migration A（expand）適用済み（`content_json`, `content_text`, `content_html` 列が存在）
- Migration B（cutover）は未適用
- `.env` に `DIRECT_URL`（直接接続 5432）が設定済み

## 実行手順

### 1. dry-run（書込なし・変換のみ検証）

```bash
# Stage1: DB → NDJSON
cd backend
npx ts-node scripts/content-migration/stage1-export.ts ./migration-export.ndjson

# Stage2: HTML → JSON 変換（dry-run）
cd ../frontend
node --loader ts-node/esm scripts/stage2-convert.ts ../backend/scripts/content-migration/migration-export.ndjson --dry-run
```

### 2. 本実行（書込あり）

```bash
# Stage1: export
cd backend
npx ts-node scripts/content-migration/stage1-export.ts ./migration-export.ndjson

# Stage2: 変換
cd ../frontend
node --loader ts-node/esm scripts/stage2-convert.ts \
  ../backend/scripts/content-migration/migration-export.ndjson \
  ../backend/scripts/content-migration/migration-converted.ndjson

# Stage3: staging 列へ書き戻し
cd ../backend
npx ts-node scripts/content-migration/stage3-import.ts ./migration-converted.ndjson

# Verify: 件数突合・フォールバック確認
npx ts-node scripts/content-migration/verify.ts ./migration-converted.ndjson
```

### 3. cutover（verify パス後のみ）

```bash
# Migration B を適用（content を JSONB 化）
DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
```

## オプション

- `--dry-run`: Stage2 を書込なしで実行（変換レポートのみ）
- `--fallback-threshold=N`: フォールバック許容件数（デフォルト: 0）

## ロールバック（cutover 後〜書込再開前）

```sql
-- content を TEXT に戻す（content_html から原本 HTML を復元）
ALTER TABLE memos ALTER COLUMN content TYPE text USING content_html;
ALTER TABLE notebooks ALTER COLUMN content TYPE text USING content_html;
```
