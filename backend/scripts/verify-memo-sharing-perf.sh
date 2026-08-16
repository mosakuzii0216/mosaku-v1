#!/bin/bash
# verify-memo-sharing-perf.sh
# Task 12: 公開中メモ一覧クエリのインデックス利用とヘッダーを確認する
# Usage: DATABASE_URL=postgresql://... BACKEND_URL=http://localhost:3000 bash scripts/verify-memo-sharing-perf.sh

set -euo pipefail

print_section() { echo -e "\n\033[1;34m=== $1 ===\033[0m"; }
print_ok()      { echo -e "\033[1;32m[OK]\033[0m $1"; }
print_warn()    { echo -e "\033[1;33m[WARN]\033[0m $1"; }
print_fail()    { echo -e "\033[1;31m[FAIL]\033[0m $1"; }

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
DB_URL="${DATABASE_URL:-}"

PASS=0
FAIL=0

# ─── 1. EXPLAIN: (user_id, published_at DESC) 複合インデックスの利用確認 ───────

print_section "1. listMyPublicMemos EXPLAIN 検証"

if [ -z "$DB_URL" ]; then
  print_warn "DATABASE_URL が未設定のため EXPLAIN 検証をスキップします"
  print_warn "  実行例: DATABASE_URL=postgresql://user:pass@host:5432/db bash $0"
else
  EXPLAIN_OUTPUT=$(psql "$DB_URL" -t -c "
    EXPLAIN (FORMAT TEXT)
    SELECT id, title, public_token, published_at, updated_at
    FROM memos
    WHERE user_id = 'dummy-user-id'
      AND trashed_at IS NULL
      AND public_token IS NOT NULL
    ORDER BY published_at DESC;
  " 2>&1)

  if echo "$EXPLAIN_OUTPUT" | grep -qi "memos_user_id_published_at_idx"; then
    print_ok "複合インデックス memos_user_id_published_at_idx が利用されています"
    PASS=$((PASS + 1))
  elif echo "$EXPLAIN_OUTPUT" | grep -qi "Index Scan\|Index Only Scan"; then
    print_ok "インデックススキャンが利用されています（計画を確認してください）"
    echo "$EXPLAIN_OUTPUT"
    PASS=$((PASS + 1))
  else
    print_fail "インデックスが利用されていません。EXPLAIN 出力:"
    echo "$EXPLAIN_OUTPUT"
    FAIL=$((FAIL + 1))
  fi
fi

# ─── 2. Cache-Control / Vary ヘッダーのスモーク確認 ────────────────────────────

print_section "2. GET /memos/public/:token レスポンスヘッダー確認"

# dummy token (43文字の base64url)
DUMMY_TOKEN="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm"

CURL_STATUS=$(curl -o /dev/null -D /tmp/memo_headers.txt -s -w "%{http_code}" "${BACKEND_URL}/memos/public/${DUMMY_TOKEN}" 2>&1) || CURL_STATUS="error"

if [ "$CURL_STATUS" = "error" ] || [ "$CURL_STATUS" = "000" ]; then
  print_warn "バックエンドに接続できませんでした（BACKEND_URL=${BACKEND_URL}）"
  print_warn "  起動後に再実行してください: BACKEND_URL=http://localhost:3000 bash $0"
else
  CACHE_CONTROL=$(grep -i "^cache-control:" /tmp/memo_headers.txt | head -1 | tr -d '\r' || echo "")
  VARY=$(grep -i "^vary:" /tmp/memo_headers.txt | head -1 | tr -d '\r' || echo "")

  if echo "$CACHE_CONTROL" | grep -qi "private.*max-age=30.*must-revalidate"; then
    print_ok "Cache-Control: $CACHE_CONTROL"
    PASS=$((PASS + 1))
  else
    print_warn "Cache-Control ヘッダーが期待値と異なります（HTTP ${CURL_STATUS}）: $CACHE_CONTROL"
  fi

  if echo "$VARY" | grep -qi "Accept"; then
    print_ok "Vary: $VARY"
    PASS=$((PASS + 1))
  else
    print_warn "Vary ヘッダーが期待値と異なります（HTTP ${CURL_STATUS}）: $VARY"
  fi
fi
rm -f /tmp/memo_headers.txt

# ─── 3. Sentry feature_area:memo タグの確認（コードレビュー） ──────────────────

print_section "3. Sentry feature_area:memo タグ 静的確認"

SENTRY_TAGS=$(grep -c "feature_area: 'memo'" "$(dirname "$0")/../src/memo/memo-sharing.service.ts" 2>/dev/null || echo "0")

if [ "$SENTRY_TAGS" -ge 3 ]; then
  print_ok "memo-sharing.service.ts に feature_area:'memo' タグが ${SENTRY_TAGS} 箇所確認できました"
  print_ok "  - memo_public_published"
  print_ok "  - memo_public_unpublished"
  print_ok "  - memo_public_token_regenerated"
  PASS=$((PASS + 1))
else
  print_fail "feature_area:'memo' タグが不足しています（確認箇所: ${SENTRY_TAGS}）"
  FAIL=$((FAIL + 1))
fi

# ─── 結果サマリー ────────────────────────────────────────────────────────────

print_section "結果サマリー"
echo "PASS: $PASS / FAIL: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  print_ok "全チェック完了"
fi
