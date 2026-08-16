#!/bin/bash
# Stop Hook: セッション終了時に macOS 通知を送信

osascript -e 'display notification "作業が完了しました" with title "Claude Code" sound name "Glass"'
