#!/bin/sh
# commit 時にステージ済みファイルを自動フォーマットする pre-commit フック

# フォーマット対象の拡張子
EXTENSIONS="ts|tsx|js|cjs|json|css|html|md"

# ステージ済みファイルのうちフォーマット対象のみ取得
STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E "\.(${EXTENSIONS})$" || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

echo "==> pre-commit: フォーマット自動修正..."
echo "$STAGED" | xargs npx prettier --write

# 修正したファイルを再ステージ
echo "$STAGED" | xargs git add
