#!/usr/bin/env bash
#
# check-recent-files.sh — 直近 N 日の refactor / test コミットで触れたファイルを返す
#
# 使い方:
#   bash check-recent-files.sh           # 直近 14 日（default）
#   bash check-recent-files.sh 30        # 直近 30 日
#
# weekly-quality-audit で同じファイルを続けて触らないよう、avoid リストとして使う。
# 監査が週次なので既定を 14 日（＝直近 2 回分）に取る。テスト追加も監査の成果物に
# 含まれるため refactor だけでなく test コミットも対象にする。

set -uo pipefail

DAYS="${1:-14}"

git log --since="${DAYS} days ago" \
        --pretty=format:"" --name-only \
        --grep="^refactor" --grep="^test" 2>/dev/null \
  | sort -u \
  | grep -v '^$' \
  || true
