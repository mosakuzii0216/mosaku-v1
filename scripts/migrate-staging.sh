#!/bin/bash
# Staging DB にマイグレーションを適用するスクリプト
# 事前に backend/.env.staging に DIRECT_URL と DATABASE_URL を設定しておくこと

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"

ENV_FILE="$BACKEND_DIR/.env.staging"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE が見つかりません"
  echo "backend/.env.staging に DIRECT_URL と DATABASE_URL を設定してください"
  exit 1
fi

export $(grep -v '^#' "$ENV_FILE" | xargs)

cd "$BACKEND_DIR"

echo "Staging DB にマイグレーションを適用中..."
npx prisma migrate deploy

echo "Prisma クライアントを生成中..."
npx prisma generate

echo "マイグレーション完了"
npx prisma migrate status
