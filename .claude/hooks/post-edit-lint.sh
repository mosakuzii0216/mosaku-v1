#!/bin/bash
# PostToolUse Hook: ファイル編集後に ESLint を自動実行

# stdin からツール情報（JSON）を読み取る
INPUT=$(cat)

# file_path を抽出
FILE_PATH=$(echo "$INPUT" | node -e "
  let d = '';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { console.log(JSON.parse(d).tool_input?.file_path || ''); }
    catch(e) { console.log(''); }
  });
")

# ファイルパスが空なら終了
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# TypeScript / JavaScript ファイルのみ対象
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.tsx && "$FILE_PATH" != *.js && "$FILE_PATH" != *.jsx ]]; then
  exit 0
fi

PROJECT_ROOT="/Users/onotakashi/mosaku"

# backend か frontend かで lint:fix を実行
if [[ "$FILE_PATH" == "$PROJECT_ROOT/backend/"* ]]; then
  cd "$PROJECT_ROOT/backend" && npx eslint --fix "$FILE_PATH" 2>/dev/null || true
elif [[ "$FILE_PATH" == "$PROJECT_ROOT/frontend/"* ]]; then
  cd "$PROJECT_ROOT/frontend" && npx eslint --fix "$FILE_PATH" 2>/dev/null || true
fi
