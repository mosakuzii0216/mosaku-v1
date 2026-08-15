#!/usr/bin/env bash
#
# run-affected-tests.sh — 変更ファイルから影響範囲のテストを実行
#
# 使い方:
#   bash run-affected-tests.sh src/auth/jwt-auth.guard.ts
#   bash run-affected-tests.sh backend/src/foo.ts frontend/src/bar.tsx
#
# 動作:
#   - 各ファイルから最寄りの package.json を遡って探し、ワークスペースを特定
#   - ワークスペースごとに basename を集約し、位置引数で絞り込み実行
#   - いずれかが失敗すれば exit 1
#
# 制約:
#   - npm script "test" が存在することが前提
#   - macOS の bash 3.x でも動くよう連想配列は使わない
#
# 絞り込みに位置引数を使う理由:
#   jest は `--testPathPattern`、vitest 4 はそのフラグ自体を知らず即エラー終了する
#   （CACError: Unknown option）。一方で「テストファイルのパスに対する絞り込み」を
#   位置引数で受ける点は両者共通なので、ランナー判定を挟まずに位置引数へ寄せる。

set -uo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <file1> [file2 ...]" >&2
  exit 1
fi

abspath() {
  if command -v realpath >/dev/null 2>&1; then
    realpath "$1"
  else
    python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
  fi
}

TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

# Step 1: 各ファイルから (workspace_dir, basename) を求めて TSV で書き出し
for f in "$@"; do
  if [[ ! -e "$f" ]]; then
    echo "WARN: $f does not exist, skipping" >&2
    continue
  fi

  dir=$(dirname "$(abspath "$f")")
  ws=""
  while [[ "$dir" != "/" && "$dir" != "" ]]; do
    if [[ -f "$dir/package.json" ]]; then
      ws="$dir"
      break
    fi
    dir=$(dirname "$dir")
  done

  if [[ -z "$ws" ]]; then
    echo "WARN: no package.json found for $f, skipping" >&2
    continue
  fi

  base=$(basename "$f")
  base="${base%.*}"      # 末尾の拡張子を1つ落とす
  base="${base%.spec}"   # .spec を落とす
  base="${base%.test}"   # .test を落とす

  printf '%s\t%s\n' "$ws" "$base" >> "$TMP_FILE"
done

if [[ ! -s "$TMP_FILE" ]]; then
  echo "ERROR: no testable workspaces resolved" >&2
  exit 1
fi

# Step 2: ワークスペースごとに pattern を集約してテスト実行
WORKSPACES=$(awk -F'\t' '{print $1}' "$TMP_FILE" | sort -u)

failed=0
while IFS= read -r ws; do
  [[ -z "$ws" ]] && continue

  patterns=()
  while IFS= read -r p; do
    [[ -n "$p" ]] && patterns+=("$p")
  done < <(awk -F'\t' -v w="$ws" '$1==w {print $2}' "$TMP_FILE" | sort -u)

  # set -u 環境で空配列を展開すると bash 3.x が落ちるため念のため守る
  [[ ${#patterns[@]} -eq 0 ]] && continue

  echo ">>> Running tests in $ws"
  echo ">>> Patterns: ${patterns[*]}"
  if ! (cd "$ws" && npm run --silent test -- "${patterns[@]}"); then
    echo "!!! Tests failed in $ws (対象テストが 1 本も無い場合もここに来る)" >&2
    failed=1
  fi
done <<< "$WORKSPACES"

exit $failed
