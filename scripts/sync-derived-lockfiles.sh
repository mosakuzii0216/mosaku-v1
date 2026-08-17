#!/usr/bin/env bash
# =============================================================================
# 派生 lockfile（backend / frontend）をルートに追随させる
# =============================================================================
#
# 背景:
#   本リポジトリは npm workspaces で、依存の解決結果はルートの
#   package-lock.json に集約される。にもかかわらず backend/ は Docker の
#   ビルドコンテキストが backend/ 単独であるため独自の lockfile を持ち、
#   frontend/ も同様（計 3 系統）。
#
#   ルート側の依存が変わると派生 lockfile が取り残され、
#   scripts/check-lockfile-sync.mjs（CI の必須チェック）が失敗する。
#   このスクリプトはその復旧手段。
#
# なぜ `cd backend && npm install --package-lock-only` では駄目なのか:
#   npm はワークスペースのルートまで遡って解決するため、派生 lockfile を
#   一切更新せず「up to date」と言って終わる（実測で確認済み）。
#   そこで package.json と lockfile を一時ディレクトリへ写し、
#   **ワークスペースのルートが見えない場所**で解決させてから書き戻す。
#
# 使い方:
#   bash scripts/sync-derived-lockfiles.sh
#   （引数でディレクトリを絞れる: bash scripts/sync-derived-lockfiles.sh backend）
#
# 実行後は必ず scripts/check-lockfile-sync.mjs で確認すること。
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
	targets=(backend frontend)
fi

for dir in "${targets[@]}"; do
	if [ ! -f "$dir/package.json" ] || [ ! -f "$dir/package-lock.json" ]; then
		echo "スキップ: $dir に package.json / package-lock.json が揃っていません" >&2
		continue
	fi

	tmp=$(mktemp -d)
	# shellcheck disable=SC2064  # 展開は今の $tmp で確定させたい
	trap "rm -rf '$tmp'" EXIT

	cp "$dir/package.json" "$dir/package-lock.json" "$tmp/"

	# --package-lock-only: node_modules を作らず lockfile だけ解決する
	# --ignore-scripts:    postinstall 等を走らせない
	( cd "$tmp" && npm install --package-lock-only --ignore-scripts )

	cp "$tmp/package-lock.json" "$dir/package-lock.json"

	rm -rf "$tmp"
	trap - EXIT

	echo "✅ $dir/package-lock.json を再生成しました"
done

echo ""
echo "同期を確認します..."
node scripts/check-lockfile-sync.mjs
