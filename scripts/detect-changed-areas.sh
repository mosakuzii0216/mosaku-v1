#!/usr/bin/env bash
# =============================================================================
# PR の変更ファイルから影響エリアを判定し、GITHUB_OUTPUT にフラグを書き出す。
# =============================================================================
#
# なぜこれが必要か:
#   workflow レベルの `paths:` フィルタは、条件に合わない PR では
#   **workflow ごと発火しない**。GitHub の必須ステータスチェックは
#   「そのチェックが成功として報告される」ことを要求するため、報告が来ない
#   状態＝永久に pending となり、その PR はマージ不能になる。
#
#   一方 job レベルの `if:` で落とした場合は check run が skipped として
#   報告され、必須チェックを満たす。よって `paths:` を捨てて workflow は
#   常に発火させ、実行要否はこのスクリプトの出力で判定する。
#
# pull_request 以外のイベント（push 等）では判定材料が無いため、
# 全エリアを true として扱う（＝従来どおり全部走らせる）。
#
# 出力（GITHUB_OUTPUT）:
#   backend=true|false    backend/ 配下に変更があるか
#   frontend=true|false   frontend/ 配下に変更があるか
#   workflows=true|false  .github/workflows/ 配下に変更があるか
#
# workflows が true のときは、CI 自体の挙動が変わっている可能性があるため
# 呼び出し側は全 job を走らせる想定（保守的に倒す）。
# =============================================================================
set -euo pipefail

emit() { echo "$1=$2" >>"$GITHUB_OUTPUT"; }

if [ "${GITHUB_EVENT_NAME:-}" != "pull_request" ]; then
	echo "イベントが ${GITHUB_EVENT_NAME:-unknown} のため、全エリアを true とする"
	emit backend true
	emit frontend true
	emit workflows true
	exit 0
fi

files=$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files" --paginate -q '.[].filename')

echo "--- 変更ファイル ---"
printf '%s\n' "$files" | sed 's/^/  /'

matches() { printf '%s\n' "$files" | grep -qE "$1"; }

matches '^backend/' && emit backend true || emit backend false
matches '^frontend/' && emit frontend true || emit frontend false
matches '^\.github/workflows/' && emit workflows true || emit workflows false

echo "--- 判定結果 ---"
grep -E '^(backend|frontend|workflows)=' "$GITHUB_OUTPUT" | sed 's/^/  /'
