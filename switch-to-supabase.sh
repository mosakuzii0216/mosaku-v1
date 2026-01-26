#!/bin/bash
# TODO: switch-to-local.shと切り替えできるように統合

echo "🔄 Switching to SUPABASE environment..."
echo ""

# .envファイルを切り替え
cp .env.supabase .env
cp .env.supabase backend/.env

echo "✅ Environment files updated"
echo "📝 Current database: Supabase PostgreSQL (cloud)"
echo ""

# ローカルDBコンテナを停止（起動していれば）
echo "🛑 Stopping local DB container (if running)..."
docker-compose stop db > /dev/null 2>&1

# バックエンドを再起動
echo "🔄 Restarting backend with Supabase..."
docker-compose restart backend

echo ""
echo "✅ Switched to SUPABASE successfully!"
echo ""
echo "📊 Environment status:"
echo "  - Database: Supabase PostgreSQL (cloud)"
echo "  - Backend: Restarting..."
echo ""
echo "To view logs: docker-compose logs -f backend"
