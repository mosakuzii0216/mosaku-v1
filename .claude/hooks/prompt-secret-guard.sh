#!/bin/bash
# UserPromptSubmit Hook: 機密情報の誤送信をブロック

INPUT=$(cat)

PROMPT=$(echo "$INPUT" | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(d).prompt || ''); }
    catch(e) { console.log(''); }
  });
")

# 検出パターン
PATTERNS=(
  'postgresql://[^:]+:[^@]+@'   # DB接続文字列（パスワード含む）
  'password\s*=\s*\S+'          # password=xxx
  'secret\s*=\s*\S+'            # secret=xxx
  'PRIVATE KEY'                  # 秘密鍵
  'eyJ[A-Za-z0-9_-]{20,}'       # JWTトークン
)

for PATTERN in "${PATTERNS[@]}"; do
  if echo "$PROMPT" | grep -qiE "$PATTERN"; then
    echo "機密情報が含まれている可能性があります（パターン: $PATTERN）。送信をブロックしました。" >&2
    exit 2  # exit 2 でブロック + エラーメッセージ表示
  fi
done

exit 0
