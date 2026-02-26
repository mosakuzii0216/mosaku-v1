#!/bin/sh
# CI (lint.yml) と同じチェックをローカルで実行する pre-push フック

set -e

echo "==> pre-push: Prisma クライアント生成..."
(cd backend && npx prisma generate --silent)

echo "==> pre-push: フォーマットチェック..."
npm run format:check --silent

echo "==> pre-push: ESLint..."
npm run lint --silent

echo "==> pre-push: TypeScript 型チェック (frontend)..."
(cd frontend && npx tsc --noEmit)

echo "==> pre-push: 全チェック通過"
