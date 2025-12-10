# データベース環境の切り替え方法

このプロジェクトは、オフライン開発とオンライン開発の両方をサポートしています。

## 利用可能な環境

### 1. ローカルPostgreSQL (オフライン開発用)
- ローカルのDockerコンテナでPostgreSQLを実行
- インターネット接続不要
- データはローカルに保存

### 2. Supabase PostgreSQL (オンライン開発用)
- クラウドホストのPostgreSQL
- 本番環境と同じ環境
- インターネット接続必要

## 環境の切り替え方法

### Supabase環境に切り替え（デフォルト）

**完全自動化 - 1コマンドで完結！**

```bash
./switch-to-supabase.sh
```

このスクリプトが自動的に:
- ✅ 環境変数ファイルを切り替え
- ✅ ローカルDBコンテナを停止
- ✅ バックエンドを再起動

### ローカルPostgreSQL環境に切り替え

**完全自動化 - 1コマンドで完結！**

```bash
./switch-to-local.sh
```

このスクリプトが自動的に:
- ✅ 環境変数ファイルを切り替え
- ✅ ローカルDBコンテナを起動
- ✅ マイグレーション状態を確認
- ✅ バックエンドを再起動

**手動でdocker-composeコマンドを実行する必要はありません！**

## 環境ファイルの説明

| ファイル | 用途 |
|---------|------|
| `.env` | 現在アクティブな環境設定 |
| `.env.local` | ローカルPostgreSQL用設定 |
| `.env.supabase` | Supabase用設定 |
| `.env.example` | 新規セットアップ用テンプレート |

## 初回セットアップ（ローカルDB使用時のみ）

ローカルPostgreSQLを初めて使う場合も、スクリプトが自動的にセットアップします:

```bash
# 1コマンドで完了！
./switch-to-local.sh
```

スクリプトが自動的に:
1. DBコンテナを起動
2. マイグレーションをチェック
3. バックエンドを再起動

マイグレーションエラーが出た場合のみ手動で実行:
```bash
cd backend && npx prisma migrate dev
```

## コマンド早見表

```bash
# Supabase環境に切り替え（完全自動）
./switch-to-supabase.sh

# ローカル環境に切り替え（完全自動）
./switch-to-local.sh

# 現在の接続先を確認
cat .env | grep DATABASE_URL

# ログを確認
docker-compose logs -f backend

# 全コンテナの状態確認
docker-compose ps
```

## トラブルシューティング

### ローカルDBに接続できない
```bash
# DBコンテナが起動しているか確認
docker ps | grep memo-app-db

# profile指定を忘れていないか確認
docker-compose --profile local up
```

### マイグレーションエラー
```bash
# Prisma Clientを再生成
cd backend
npx prisma generate

# マイグレーションをリセット（注意：データが消えます）
npx prisma migrate reset
```

### .envファイルが正しく切り替わらない
```bash
# 手動でコピー
cp .env.local .env
cp .env.local backend/.env

# または
cp .env.supabase .env
cp .env.supabase backend/.env
```

## ベストプラクティス

1. **オフライン作業時**: ローカルPostgreSQLを使用
2. **本番に近い環境でテスト時**: Supabaseを使用
3. **環境切り替え後**: 必ずバックエンドを再起動
4. **定期的に**: Supabase環境でテストしてデータ整合性を確認
