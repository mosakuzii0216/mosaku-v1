#!/bin/bash
# UserPromptSubmit Hook: ユーザープロンプトを JSONL でログ収集
#
# stdin で受け取る JSON 例:
#   { "hook_event_name": "UserPromptSubmit",
#     "prompt": "...", "session_id": "...",
#     "cwd": "...", "transcript_path": "..." }
#
# 出力: .claude/prompt-log.jsonl に1行追記
#   { "timestamp": "...", "session_id": "...", "cwd": "...", "prompt": "..." }

set -u

LOG_FILE="/Users/onotakashi/mosaku/.claude/prompt-log.jsonl"

INPUT=$(cat)

# Node で JSON パース → 必要フィールド抽出 → JSONL 1行追記
# 失敗しても Claude 本体を止めないよう catch して silent fail
echo "$INPUT" | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(d);
      const entry = {
        timestamp: new Date().toISOString(),
        session_id: data.session_id || null,
        cwd: data.cwd || null,
        prompt: data.prompt || ''
      };
      require('fs').appendFileSync('$LOG_FILE', JSON.stringify(entry) + '\n');
    } catch (e) {
      // silent: ログ失敗で Claude を止めない
    }
  });
"

exit 0
