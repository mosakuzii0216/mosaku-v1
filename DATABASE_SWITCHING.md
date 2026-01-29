# データベース環境の切り替え方法

このプロジェクトは、オフライン（ローカル）開発とオンライン（Supabase）環境を分けて運用します。ローカル開発では Supabase を使用しません。ローカルはローカルPostgreSQL を使うことを前提とします。

## 利用可能な環境

### 1. ローカルPostgreSQL（開発用・既定）
- ローカルの Docker コンテナで PostgreSQL を実行
- インターネット接続不要
- 開発・デバッグは基本的にこの環境で行う

### 2. Supabase PostgreSQL（オンライン／ステージング・本番相当）
- クラウドホストの PostgreSQL（Supabase）
- ステージングや本番に近い環境での検証や E2E テストに利用
- インターネット接続が必要

## 環境の切り替え方法

> 注: 以前の切替スクリプトは削除されています。手動で .env を切り替えてください。

### ローカル開発（既定）に切り替える
1. ルートと backend 用の .env をローカル設定に置き換えます:
   ```bash
   cp .env.local .env
   cp .env.local backend/.env
   ```
2. ローカル DB コンテナを起動します（プロジェクトの docker-compose 設定に合わせてください）:
   ```bash
   docker-compose --profile local up -d
   ```
3. 必要ならマイグレーションを適用または確認します:
   ```bash
   cd backend
   npx prisma migrate dev
   ```
4. バックエンドを起動または再起動します:
   ```bash
   docker-compose restart backend
   ```
5. 接続先を確認:
   ```bash
   grep DATABASE_URL .env
   ```

### Supabase（クラウド）環境に切り替える（利用時のみ）
1. ルートと backend 用の .env を Supabase 設定に置き換えます:
   ```bash
   cp .env.supabase .env
   cp .env.supabase backend/.env
   ```
2. ローカル DB コンテナが動作している場合は停止します:
   ```bash
   docker-compose --profile local down
   ```
3. バックエンドを再起動します:
   ```bash
   docker-compose restart backend
   ```
4. 接続先を確認:
   ```bash
   grep DATABASE_URL .env
   ```

## 環境ファイルの説明

| ファイル | 用途 |
|---------|------|
| `.env` | 現在アクティブな環境設定 |
| `.env.local` | ローカルPostgreSQL用設定（開発用） |
| `.env.supabase` | Supabase用設定（クラウド／ステージング／本番用） |
| `.env.example` | 新規セットアップ用テンプレート |

## 初回セットアップ（ローカルDB使用時）

1. .env をローカル用にコピー:
   ```bash
   cp .env.local .env
   cp .env.local backend/.env
   ```
2. DB コンテナを起動:
   ```bash
   docker-compose --profile local up -d
   ```
3. マイグレーションを適用:
   ```bash
   cd backend
   npx prisma migrate dev
   ```
4. バックエンドを起動:
   ```bash
   docker-compose up -d backend
   ```

マイグレーションエラーが出た場合:
```bash
cd backend && npx prisma migrate dev
```

## コマンド早見表

```bash
# ローカル開発に切り替え（既定）
cp .env.local .env
cp .env.local backend/.env
docker-compose --profile local up -d
cd backend && npx prisma migrate dev
docker-compose restart backend

# Supabase に切り替え（必要時のみ）
cp .env.supabase .env
cp .env.supabase backend/.env
docker-compose --profile local down
docker-compose restart backend

# 現在の接続先を確認
grep DATABASE_URL .env

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

# プロファイル指定を忘れていないか確認
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
# 手動でコピーして backend の .env も上書き
cp .env.local .env
cp .env.local backend/.env
# または
cp .env.supabase .env
cp .env.supabase backend/.env
```

## ベストプラクティス

1. ローカル開発では常にローカルPostgreSQLを使用する（既定）
2. ステージングや本番相当の検証は Supabase を使用する
3. 環境切り替え後は必ずバックエンドを再起動する
4. 定期的に Supabase 上で統合テストを行いデータ整合性を確認する