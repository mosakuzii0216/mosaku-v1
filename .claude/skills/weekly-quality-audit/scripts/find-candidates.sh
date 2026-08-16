#!/usr/bin/env bash
#
# find-candidates.sh — weekly-quality-audit スキル用の候補列挙スクリプト
#
# 使い方:
#   bash find-candidates.sh                # カレントディレクトリを対象
#   bash find-candidates.sh backend        # 指定ディレクトリを対象
#
# 出力: セクション区切りのプレーンテキスト（=== SECTION === 形式）
#   - WORKSPACE            : 対象ディレクトリ
#   - LINT_TYPE_GATE       : ESLint / tsc の残渣（通常はゼロ。出たら最優先で潰す）
#   - UNTESTED_FILES       : テストが隣に無い実装ファイル（行数の多い順）
#   - LARGE_FILES          : 分割を検討すべき巨大ファイル
#   - DUPLICATE_HINTS      : 複数ファイルに散らばる同一ロジック行
#   - WHAT_COMMENTS_HINT   : WHAT を説明するコメントの候補
#   - MAGIC_NUMBERS        : 定数化を検討すべき数値リテラル
#   - RECENT_AUDIT_FILES   : avoid リスト（直近 EXCLUDE_DAYS 日の refactor/test コミット）
#
# 設計方針:
#   ESLint と tsc が pre-push / CI で常時ゼロに強制している領域（未使用 import・any・
#   no-unsafe-*）を毎回スキャンしても構造上ゼロ件にしかならない。このスクリプトは
#   「機械が判定できず人間の判断が要る負債」を主戦場に置き、Lint/型は健全性ゲートとして
#   確認だけする。
#
# 環境変数:
#   EXCLUDE_DAYS   : avoid 対象とする直近日数（default: 14）
#   LARGE_FILE_MIN : 巨大ファイルとみなす行数（default: 300）
#   TOP_N          : 各セクションの最大表示件数（default: 20）

set -uo pipefail

WORKSPACE="${1:-.}"
cd "$WORKSPACE" || { echo "ERROR: cannot cd into $WORKSPACE" >&2; exit 1; }

EXCLUDE_DAYS="${EXCLUDE_DAYS:-14}"
LARGE_FILE_MIN="${LARGE_FILE_MIN:-300}"
TOP_N="${TOP_N:-20}"

echo "=== WORKSPACE ==="
pwd
echo

if [[ ! -f package.json ]]; then
  echo "ERROR: $(pwd) has no package.json" >&2
  exit 1
fi

# 実装ファイル（テスト・ベンチ・型定義・生成物を除く）を列挙する共通関数。
# 対象は src/ 配下に限る（設定ファイルや e2e はリファクタ対象外）。
list_source_files() {
  find . -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -path '*/.next/*' \
    -not -path '*/e2e/*' \
    -not -name '*.spec.ts' -not -name '*.spec.tsx' \
    -not -name '*.test.ts' -not -name '*.test.tsx' \
    -not -name '*.bench.ts' -not -name '*.bench.tsx' \
    -not -name '*.d.ts' \
    2>/dev/null | grep '/src/' || true
}

echo "=== LINT_TYPE_GATE ==="
# ここが空であることが正常。空でなければ他の何より先に潰す。
if grep -q '"lint"' package.json 2>/dev/null; then
  echo "--- eslint ---"
  npm run --silent lint 2>&1 | tail -40 || true
else
  echo "--- eslint --- (no lint script in package.json)"
fi

# モノレポではルートに tsconfig.json が無く、実体は backend/ frontend/ 側にある。
# ルートだけを見て諦めると型エラーを丸ごと取りこぼすため、直下のワークスペースも辿る。
TSC_TARGETS=()
[[ -f tsconfig.json ]] && TSC_TARGETS+=(".")
for d in */; do
  [[ -f "${d}package.json" && -f "${d}tsconfig.json" ]] && TSC_TARGETS+=("${d%/}")
done

if [[ ${#TSC_TARGETS[@]} -eq 0 ]]; then
  echo "--- tsc --- (no tsconfig.json found in workspace root or its immediate subdirectories)"
else
  for t in "${TSC_TARGETS[@]}"; do
    echo "--- tsc: $t ---"
    (cd "$t" && npx --no-install tsc --noEmit 2>&1 | head -40) || true
  done
fi
echo

echo "=== UNTESTED_FILES ==="
# 隣接するテストファイルが存在しない実装ファイル。行数が多い＝未検証ロジックが多いので
# 行数降順で並べ、価値の高いものから提示する。
untested_count=0
total_count=0
{
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    total_count=$((total_count + 1))
    stem="${f%.*}"
    if [[ -f "$stem.test.ts" || -f "$stem.test.tsx" \
       || -f "$stem.spec.ts" || -f "$stem.spec.tsx" ]]; then
      continue
    fi
    untested_count=$((untested_count + 1))
    printf '%s\t%s\n' "$(wc -l < "$f" | tr -d ' ')" "$f"
  done < <(list_source_files)
  echo "__SUMMARY__	$untested_count/$total_count"
} > /tmp/.wqa_untested.$$ 2>/dev/null

summary=$(grep '^__SUMMARY__' /tmp/.wqa_untested.$$ | cut -f2)
grep -v '^__SUMMARY__' /tmp/.wqa_untested.$$ | sort -rn | head -"$TOP_N" \
  | awk -F'\t' '{printf "%5s lines  %s\n", $1, $2}'
echo "(テスト無し: ${summary:-unknown} ファイル / 上位 ${TOP_N} 件を表示)"
rm -f /tmp/.wqa_untested.$$
echo

echo "=== LARGE_FILES ==="
# 単一責務から膨らんだ可能性のあるファイル。分割は必ず「振る舞いを変えない移動」に留める。
list_source_files | while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  n=$(wc -l < "$f" | tr -d ' ')
  [[ "$n" -ge "$LARGE_FILE_MIN" ]] && printf '%s\t%s\n' "$n" "$f"
done | sort -rn | head -"$TOP_N" | awk -F'\t' '{printf "%5s lines  %s\n", $1, $2}'
echo "(閾値: ${LARGE_FILE_MIN} 行以上)"
echo

echo "=== DUPLICATE_HINTS ==="
# 2 ファイル以上に現れる同一の実装行。import や括弧だけの行はノイズなので落とす。
# 完全一致しか見ないため精度は低いが、共通化の当たりをつけるには十分。
list_source_files | xargs grep -hn '' 2>/dev/null \
  | sed -E 's/^[0-9]+://' \
  | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
  | grep -vE '^(import|export|//|/\*|\*|\}|\{|\)|\(|$)' \
  | grep -vE '^(return|break|continue|else|try|});|};|\);)$' \
  | awk 'length($0) > 30' \
  | sort | uniq -c | sort -rn \
  | awk -v n="$TOP_N" '$1 >= 2 { print; c++ } c >= n { exit }'
echo "(同一行の出現回数 >= 2。共通化候補の当たり用)"
echo

echo "=== WHAT_COMMENTS_HINT ==="
# rg に tsx という型は無く（-t ts が *.tsx も含む）、指定すると即エラー終了して
# 候補がゼロ件になる。また e2e はリファクタ対象外なので両実装で除外する。
if command -v rg >/dev/null 2>&1; then
  rg -n --no-heading -t ts \
     -e '^\s*//\s*[^/].{8,}[。．\.]\s*$' \
     -g '!**/*.spec.*' -g '!**/*.test.*' -g '!**/e2e/**' \
     -g '!**/dist/**' -g '!**/node_modules/**' \
     2>/dev/null | head -"$TOP_N" || true
else
  grep -rn -E '^\s*//\s*[^/].{8,}[。．\.]\s*$' \
    --include='*.ts' --include='*.tsx' \
    --exclude='*.spec.ts' --exclude='*.spec.tsx' \
    --exclude='*.test.ts' --exclude='*.test.tsx' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=e2e \
    . 2>/dev/null | head -"$TOP_N" || true
fi
echo

echo "=== MAGIC_NUMBERS ==="
# 3 桁以上の裸のリテラルと時間計算。以下は「名前が付いている / 定数化しても読みやすく
# ならない」ためノイズとして落とす:
#   定数宣言行・コメント行・Tailwind のカラークラス(text-red-600)・HTTP ステータス
#   ・色コード・画像寸法(192x192)・パーセントや基数(100, 255, 16)
list_source_files | xargs grep -nE '[^A-Za-z0-9_."'"'"']([0-9]{3,}|[0-9]+ \* 60|60 \* [0-9]+|24 \* 60)' 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(const|let|export const)[[:space:]]+[A-Z_]+[[:space:]]*=' \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' \
  | grep -vE '\-[0-9]{2,3}\b' \
  | grep -vE '(status|statusCode|status_code)[[:space:]]*(===|==|!==|:)[[:space:]]*[0-9]{3}' \
  | grep -vE '(z-index|zIndex|0x[0-9a-fA-F]+|#[0-9a-fA-F]{3,})' \
  | grep -vE '[0-9]+x[0-9]+' \
  | grep -vE '(xmlns|viewBox|<svg|d="M|d=\{|pathLength)' \
  | grep -vE '[^0-9](100|255|360|180|16)[^0-9]*[),;]?[[:space:]]*$' \
  | head -"$TOP_N" || true
echo

echo "=== RECENT_AUDIT_FILES ==="
# 直近 N 日の refactor / test コミットで触ったファイル（重複作業を避けるための avoid リスト）
git log --since="${EXCLUDE_DAYS} days ago" \
        --pretty=format:"" --name-only \
        --grep="^refactor" --grep="^test" 2>/dev/null \
  | sort -u \
  | grep -v '^$' \
  | head -60 \
  || echo "(none)"
echo

echo "=== END ==="
