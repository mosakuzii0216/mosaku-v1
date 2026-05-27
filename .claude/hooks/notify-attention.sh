#!/bin/bash
# Notification Hook: ユーザの入力・許可待ちのときに macOS 通知を送信

INPUT=$(cat)
MSG=$(echo "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('message', '入力待ちだよ'))" 2>/dev/null || echo "入力待ちだよ")

# シェルメタ文字をエスケープ
MSG_ESCAPED=$(echo "$MSG" | sed 's/"/\\"/g')

osascript -e "display notification \"$MSG_ESCAPED\" with title \"Claude Code 待ってるよ〜\" sound name \"Funk\""
