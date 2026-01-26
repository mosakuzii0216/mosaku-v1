#!/bin/bash
# TODO: switch-to-supabase.shと切り替えできるように統合

echo "🔄 Switching to LOCAL PostgreSQL environment..."
echo ""

# .envファイルを切り替え
cp .env.local .env
cp .env.local backend/.env

echo "✅ Environment files updated"
echo "📝 Current database: Local PostgreSQL (localhost:5432)"
echo ""

# ローカルDBコンテナを起動
echo "🚀 Starting local PostgreSQL container..."
docker-compose --profile local up -d db

# DBが完全に起動するまで待機
echo "⏳ Waiting for database to be ready..."
sleep 3

# マイグレーションの確認
echo "🔍 Checking migrations..."
cd backend
npx prisma migrate deploy > /dev/null 2>&1
MIGRATION_STATUS=$?
cd ..

if [ $MIGRATION_STATUS -eq 0 ]; then
    echo "✅ Migrations are up to date"
else
    echo "⚠️  Migration check failed - you may need to run: cd backend && npx prisma migrate dev"
fi

# バックエンドを再起動
echo "🔄 Restarting backend with local DB..."
docker-compose restart backend

echo ""
echo "✅ Switched to LOCAL PostgreSQL successfully!"
echo ""
echo "📊 Environment status:"
echo "  - Database: Local PostgreSQL (localhost:5432)"
echo "  - Backend: Restarting..."
echo ""
echo "To view logs: docker-compose logs -f backend"
