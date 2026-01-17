# Mosakuアプリケーション デプロイ手順書

## 📋 目次

1. [前提条件](#前提条件)
2. [Phase 1: Supabase設定](#phase-1-supabase設定)
3. [Phase 2: Google Cloud Secret Manager設定](#phase-2-google-cloud-secret-manager設定)
4. [Phase 3: バックエンドのビルドとデプロイ](#phase-3-バックエンドのビルドとデプロイ)
5. [Phase 4: フロントエンドのデプロイ](#phase-4-フロントエンドのデプロイ)
6. [Phase 4.5: データベースマイグレーション](#phase-45-データベースマイグレーション)
7. [Phase 5: 動作確認](#phase-5-動作確認)
8. [Phase 6: デプロイ後のメンテナンス](#phase-6-デプロイ後のメンテナンス)
9. [トラブルシューティング](#トラブルシューティング)
10. [付録A: 実際の環境情報](#付録a-実際の環境情報)
11. [付録B: クイックリファレンス](#付録b-クイックリファレンス)

---

## 前提条件

### 必要なツール

- [x] Node.js 22.x
- [x] npm
- [x] Google Cloud CLI (gcloud)
- [x] Vercel CLI
- [x] Git

### アカウント・プロジェクト

- [x] Supabaseアカウントとプロジェクト
- [x] Google Cloud プロジェクト（ID: `igneous-core-480923-j0`）
- [x] Vercelアカウント

### 確認コマンド

```bash
# バージョン確認
node --version    # v22.x.x
npm --version     # 10.x.x
gcloud --version  # 最新版
vercel --version  # 最新版

# Google Cloud ログイン確認
gcloud auth list

# Google Cloud プロジェクト設定確認
gcloud config get-value project
# 出力: igneous-core-480923-j0
```

---

## Phase 1: Supabase設定

### ステップ1.1: Supabaseプロジェクト情報の取得

1. **Supabaseダッシュボードにアクセス**
   - URL: https://supabase.com/dashboard
   - プロジェクト `ninyjmahwnbtgqqjxcli` を選択

2. **プロジェクトステータスの確認**
   - プロジェクトが "Active" 状態であることを確認
   - "Paused" の場合は "Resume" ボタンをクリック

3. **データベース接続情報の取得**
   - 左サイドバーから **⚙️ Settings** をクリック
   - **Database** セクションを選択

### ステップ1.2: Connection Pooling（Transaction mode）の取得

1. **Connection Pooling** セクションまでスクロール
2. **Mode** を **Transaction** に設定
3. **URI** タブをクリック
4. 表示された接続文字列をコピー

   **形式例:**
   ```
   postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-X-xx-xxxx-X.pooler.supabase.com:6543/postgres
   ```

   **メモ:**
   - ポート番号: `6543`
   - 用途: アプリケーションのメインデータベース接続

5. この接続文字列を安全な場所にメモ（後で使用）

### ステップ1.3: Session Pooler接続文字列の取得

1. 同じ **Connection Pooling** セクションで
2. **Mode** を **Session** に変更
3. **URI** タブの接続文字列をコピー

   **形式例:**
   ```
   postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-X-xx-xxxx-X.pooler.supabase.com:5432/postgres
   ```

   **メモ:**
   - ポート番号: `5432`
   - 用途: マイグレーションやダイレクト接続（IPv4互換）

4. この接続文字列も安全な場所にメモ

### ステップ1.4: Supabase Anon Keyの取得

1. 左サイドバーから **⚙️ Settings** → **API** を選択
2. **Project API keys** セクションを見つける
3. **anon** **public** キーをコピー

   **形式例:**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

4. このキーを安全な場所にメモ

### ステップ1.5: Supabase URL の取得

1. 同じ **API** ページの **Configuration** セクション
2. **Project URL** をコピー

   **形式例:**
   ```
   https://PROJECT_REF.supabase.co
   ```

3. このURLを安全な場所にメモ

### ✅ Phase 1 完了チェックリスト

- [ ] Transaction Pooler 接続文字列を取得（ポート6543）
- [ ] Session Pooler 接続文字列を取得（ポート5432）
- [ ] Supabase Anon Key を取得
- [ ] Supabase Project URL を取得

---

## Phase 2: Google Cloud Secret Manager設定

### ステップ2.1: Google Cloudプロジェクトの設定

```bash
# プロジェクトIDを設定
gcloud config set project igneous-core-480923-j0

# リージョンを設定（東京）
gcloud config set run/region asia-northeast1

# 設定確認
gcloud config list
```

### ステップ2.1.5: PROJECT_REFとPASSWORDの確認

Secret Managerに接続文字列を登録する前に、以下の値を確認します。

#### PROJECT_REF の確認

**方法A: プロジェクト設定から確認**

1. Supabase Dashboard (https://supabase.com/dashboard) にアクセス
2. プロジェクト `ninyjmahwnbtgqqjxcli` を選択
3. 左サイドバーから **⚙️ Settings** → **General** を選択
4. **Project Settings** セクションの **Reference ID** に表示されている値が `PROJECT_REF` です
   - 例: `ninyjmahwnbtgqqjxcli`

**方法B: 接続文字列から確認**

Phase 1のステップ1.2とステップ1.3で取得した接続文字列に既に含まれています。

形式例:
```
postgresql://postgres.ninyjmahwnbtgqqjxcli:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
                     ^^^^^^^^^^^^^^^^^^^^
                     これがPROJECT_REF
```

#### PASSWORD の確認

**パスワードを覚えている場合**:
- データベース作成時に設定したパスワードをそのまま使用します

**パスワードを忘れた場合**:

1. Supabase Dashboard → **⚙️ Settings** → **Database** を選択
2. **Database password** セクションを見つける
3. **Reset database password** ボタンをクリック
4. 新しいパスワードが生成され、表示されます
5. **⚠️ 重要**: このパスワードは一度しか表示されないので、必ず安全な場所にメモしてください
6. パスワードをリセットした場合、Phase 1で取得した接続文字列の `[PASSWORD]` 部分を新しいパスワードに置き換えてください

**注意事項**:
- パスワードに特殊文字（`?`, `@`, `#`, `&`, `=`, `/`, など）が含まれる場合は、URLエンコードが必要です
  - 例: `?` → `%3F`, `@` → `%40`, `#` → `%23`, `&` → `%26`
  - オンラインのURLエンコーダー（例: https://www.urlencoder.org/）を使用できます

### ステップ2.2: Secret Managerへのシークレット登録

#### DATABASE_URL の登録

```bash
# Phase 1 で取得したTransaction Pooler接続文字列を使用
echo -n "postgresql://postgres.PROJECT_REF:PASSWORD@aws-X-xx-xxxx-X.pooler.supabase.com:6543/postgres" | \
  gcloud secrets create database-url --data-file=-

# または既存のシークレットを更新する場合
echo -n "postgresql://postgres.PROJECT_REF:PASSWORD@aws-X-xx-xxxx-X.pooler.supabase.com:6543/postgres" | \
  gcloud secrets versions add database-url --data-file=-
```

**重要:**
- `PROJECT_REF` と `PASSWORD` を実際の値に置き換えてください
- パスワードに特殊文字（`?`, `@`, `#` など）が含まれる場合はURLエンコードが必要
  - 例: `?` → `%3F`, `@` → `%40`, `#` → `%23`

#### DIRECT_URL の登録

```bash
# Phase 1 で取得したSession Pooler接続文字列を使用
echo -n "postgresql://postgres.PROJECT_REF:PASSWORD@aws-X-xx-xxxx-X.pooler.supabase.com:5432/postgres" | \
  gcloud secrets create direct-url --data-file=-

# または既存のシークレットを更新
echo -n "postgresql://postgres.PROJECT_REF:PASSWORD@aws-X-xx-xxxx-X.pooler.supabase.com:5432/postgres" | \
  gcloud secrets versions add direct-url --data-file=-
```

#### SUPABASE_ANON_KEY の登録

```bash
# Phase 1 で取得したAnon Keyを使用
echo -n "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." | \
  gcloud secrets create supabase-anon-key --data-file=-

# または既存のシークレットを更新
echo -n "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." | \
  gcloud secrets versions add supabase-anon-key --data-file=-
```

#### その他の必須シークレット

```bash
# JWT_SECRET (ランダムな文字列を生成)
openssl rand -base64 32 | tr -d '\n' | \
  gcloud secrets create jwt-secret --data-file=-

# SESSION_SECRET (ランダムな文字列を生成)
openssl rand -base64 32 | tr -d '\n' | \
  gcloud secrets create session-secret --data-file=-

# OAuth関連のシークレット（Google）
echo -n "YOUR_GOOGLE_CLIENT_SECRET" | \
  gcloud secrets create google-client-secret --data-file=-

# OAuth関連のシークレット（GitHub）
echo -n "YOUR_GITHUB_CLIENT_SECRET" | \
  gcloud secrets create github-client-secret --data-file=-

# OAuth関連のシークレット（X/Twitter）
echo -n "YOUR_X_CONSUMER_SECRET" | \
  gcloud secrets create x-consumer-secret --data-file=-

echo -n "YOUR_X_ACCESS_TOKEN" | \
  gcloud secrets create x-access-token --data-file=-

echo -n "YOUR_X_ACCESS_TOKEN_SECRET" | \
  gcloud secrets create x-access-token-secret --data-file=-
```

### ステップ2.3: シークレットの確認

```bash
# 全シークレットのリスト表示
gcloud secrets list

# 特定のシークレットの内容確認（テスト用）
gcloud secrets versions access latest --secret=database-url

# ⚠️ 本番環境では内容を表示しないこと！
```

### ✅ Phase 2 完了チェックリスト

- [ ] database-url シークレットを作成
- [ ] direct-url シークレットを作成
- [ ] supabase-anon-key シークレットを作成
- [ ] jwt-secret シークレットを作成
- [ ] session-secret シークレットを作成
- [ ] OAuth関連のシークレットを作成（使用する場合）

---

## Phase 3: バックエンドのビルドとデプロイ

### ステップ3.1: コードの準備

```bash
# プロジェクトルートに移動
cd /path/to/mosaku

# 最新のコードを取得
git pull origin main

# バックエンドディレクトリに移動
cd backend

# 依存関係のインストール
npm install

# Prismaクライアント生成
npx prisma generate
```

### ステップ3.2: ローカルビルドテスト（オプション）

```bash
# TypeScriptビルド
npm run build

# ビルド成功を確認
ls -la dist/

# エラーがある場合は修正してから次に進む
```

### ステップ3.3: Dockerイメージのビルドとプッシュ

```bash
# プロジェクトルートに戻る
cd ..

# backendディレクトリに移動
cd backend

# Google Cloud Buildを使用してビルド＆プッシュ
gcloud builds submit \
  --tag gcr.io/igneous-core-480923-j0/mosaku-backend:latest \
  --timeout=20m

# ビルド完了を待つ（5-10分程度）
```

**ビルド時の出力例:**
```
BUILD SUCCESS
Pushing gcr.io/igneous-core-480923-j0/mosaku-backend:latest
...
DONE
```

### ステップ3.4: イメージの確認

```bash
# プッシュされたイメージの確認
gcloud container images list-tags gcr.io/igneous-core-480923-j0/mosaku-backend
```

### ステップ3.5: Cloud Runサービスのデプロイ

#### 環境変数の準備

まず、フロントエンドのURLを確認（Phase 4で取得予定、仮の値を使用）:
- 開発用: `https://mosaku-XXXXXX.vercel.app`
- 本番用: `https://mosaku.vercel.app`

#### デプロイコマンド実行

```bash
# Cloud Runにデプロイ
gcloud run deploy mosaku-backend \
  --image=gcr.io/igneous-core-480923-j0/mosaku-backend:latest \
  --region=asia-northeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --set-env-vars="NODE_ENV=production,SUPABASE_URL=https://dgyibghcbmwssafhlfol.supabase.co,FRONTEND_URL=https://frontend-mosakuziis-projects.vercel.app,CORS_ORIGINS=https://frontend-mosakuziis-projects.vercel.app,ADMIN_EMAIL=mosakuzii1928@gmail.com" \
  --set-secrets="DATABASE_URL=database-url:latest,DIRECT_URL=direct-url:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest,JWT_SECRET=jwt-secret:latest,SESSION_SECRET=session-secret:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,GITHUB_CLIENT_SECRET=github-client-secret:latest,X_CONSUMER_SECRET=x-consumer-secret:latest"
```

**パラメータ説明:**
- `--image`: 使用するコンテナイメージ
- `--region`: デプロイ先リージョン（東京）
- `--allow-unauthenticated`: 公開アクセスを許可
- `--port`: アプリケーションのポート
- `--cpu`: CPU数（1vCPU）
- `--memory`: メモリ（512MB）
- `--min-instances`: 最小インスタンス数（0=完全スケールダウン可能）
- `--max-instances`: 最大インスタンス数
- `--timeout`: リクエストタイムアウト（秒）
- `--set-env-vars`: 環境変数
- `--set-secrets`: Secret Managerのシークレット

#### デプロイ完了の確認

```bash
# デプロイ完了後に表示されるService URLをメモ
# 例: https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app
```

### ステップ3.6: バックエンドの動作確認

```bash
# ヘルスチェックエンドポイントをテスト
curl https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/health

# 期待される出力:
# {"status":"ok","timestamp":"2026-01-05T..."}
```

**エラーが出る場合:**
```bash
# ログを確認
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mosaku-backend" \
  --limit=50 \
  --format="table(timestamp,severity,textPayload)"
```

### ✅ Phase 3 完了チェックリスト

- [ ] コードの準備完了
- [ ] Dockerイメージのビルド成功
- [ ] Cloud Runへのデプロイ成功
- [ ] ヘルスチェックが正常に応答
- [ ] Service URLをメモ

---

## Phase 4: フロントエンドのデプロイ

### ステップ4.1: 環境変数の準備

フロントエンド用の `.env.production` ファイルを作成:

```bash
# frontendディレクトリに移動
cd ../frontend

# .env.production ファイルを作成
cat > .env.production << 'EOF'
# Backend API URL（Phase 3で取得したURL）
VITE_BACKEND_URL=https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app

# Application URL（Vercelから後で取得）
VITE_APP_URL=https://mosaku.vercel.app

# Supabase設定（Phase 1で取得）
VITE_SUPABASE_URL=https://dgyibghcbmwssafhlfol.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OAuth Client IDs（フロントエンド用、ローカルの.envから取得）
VITE_GOOGLE_CLIENT_ID=XXXXX.apps.googleusercontent.com
VITE_GITHUB_CLIENT_ID=XXXXX
VITE_X_CONSUMER_KEY=XXXXX
EOF
```

### ステップ4.2: Vercel環境変数の設定

#### 方法A: Vercel CLIを使用

```bash
# Vercelにログイン
vercel login

# プロジェクトとリンク
vercel link

# 環境変数を設定
vercel env add VITE_BACKEND_URL production
# 入力: https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app

vercel env add VITE_SUPABASE_URL production
# 入力: https://dgyibghcbmwssafhlfol.supabase.co

vercel env add VITE_SUPABASE_ANON_KEY production
# 入力: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

vercel env add VITE_APP_URL production
# 入力: https://mosaku.vercel.app

# OAuth Client IDs
vercel env add VITE_GOOGLE_CLIENT_ID production
vercel env add VITE_GITHUB_CLIENT_ID production
vercel env add VITE_X_CONSUMER_KEY production
```

#### 方法B: Vercel Dashboardを使用

1. https://vercel.com/dashboard にアクセス
2. `mosaku` プロジェクトを選択
3. **Settings** → **Environment Variables** を開く
4. 以下の環境変数を追加（Environment: Production）:
   - `VITE_BACKEND_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL`
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_GITHUB_CLIENT_ID`
   - `VITE_X_CONSUMER_KEY`

### ステップ4.3: Vercelへのデプロイ

```bash
# プロダクションデプロイ
vercel --prod

# デプロイ完了を待つ
# 表示されるProduction URLをメモ
```

**デプロイ出力例:**
```
🔍  Inspect: https://vercel.com/...
✅  Production: https://mosaku.vercel.app
```

### ステップ4.4: CORS設定の更新

フロントエンドのURLが確定したら、バックエンドのCORS設定を更新:

```bash
# Cloud Runサービスを更新
cd ../backend

gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --update-env-vars="CORS_ORIGINS=https://mosaku.vercel.app,FRONTEND_URL=https://mosaku.vercel.app"
```

### ステップ4.5: OAuth リダイレクトURLの設定

各OAuthプロバイダーのコンソールでリダイレクトURLを設定:

#### Google OAuth
1. https://console.cloud.google.com/apis/credentials
2. OAuth 2.0 クライアント ID を選択
3. 承認済みのリダイレクト URI に追加:
   - `https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/auth/google/callback`

#### GitHub OAuth
1. https://github.com/settings/developers
2. OAuth Apps → 該当アプリを選択
3. Authorization callback URL に設定:
   - `https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/auth/github/callback`

#### X (Twitter) OAuth
1. https://developer.twitter.com/en/portal/dashboard
2. アプリ設定 → Authentication settings
3. Callback URLs に追加:
   - `https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/auth/x/callback`

### ✅ Phase 4 完了チェックリスト

- [ ] フロントエンド環境変数を設定
- [ ] Vercelにデプロイ成功
- [ ] Production URLを取得
- [ ] バックエンドのCORS設定を更新
- [ ] OAuthリダイレクトURLを設定

---

## Phase 4.5: データベースマイグレーション

デプロイ前またはデプロイ直後に、データベーススキーマをマイグレーションする必要があります。

### 前提条件: schema.prismaの設定確認

マイグレーション実行前に、`backend/prisma/schema.prisma`に`directUrl`設定があることを確認してください：

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // この行が必要
}
```

もし`directUrl`の行がない場合は追加してください。

### ステップ4.5.1: マイグレーションの実行

**方法A: Secret Managerから取得（推奨）**

```bash
# プロジェクトルートに移動
cd /path/to/mosaku/backend

# Secret Managerから接続文字列を取得してマイグレーション実行
DATABASE_URL=$(gcloud secrets versions access latest --secret="database-url")
DIRECT_URL=$(gcloud secrets versions access latest --secret="direct-url")

# .envファイルを一時的にリネーム
mv .env .env.backup

# マイグレーション実行
DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" npx prisma migrate deploy

# .envファイルを復元
mv .env.backup .env

# 成功すると以下のようなメッセージが表示される
# ✔ All migrations have been successfully applied.
```

**方法B: 手動で接続文字列を指定**

```bash
# プロジェクトルートに移動
cd /path/to/mosaku/backend

# 環境変数を設定してマイグレーション実行
# DATABASE_URL: Transaction Pooler（ポート6543）
# DIRECT_URL: Session Pooler（ポート5432）
DATABASE_URL="postgresql://postgres.dgyibghcbmwssafhlfol:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres" \
DIRECT_URL="postgresql://postgres.dgyibghcbmwssafhlfol:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" \
npx prisma migrate deploy
```

**注意事項**:
- `[PASSWORD]`は実際のSupabaseデータベースパスワードに置き換えてください
- パスワードに特殊文字が含まれる場合はURLエンコードが必要です（`?` → `%3F`, `@` → `%40`など）
- `DATABASE_URL`と`DIRECT_URL`の両方が必要です
- マイグレーションは`DIRECT_URL`（Session Pooler、ポート5432）を使用します
- 通常のクエリは`DATABASE_URL`（Transaction Pooler、ポート6543）を使用します

### ステップ4.5.2: マイグレーションの確認

**方法A: Secret Managerから取得（推奨）**

```bash
# Secret Managerから取得
DATABASE_URL=$(gcloud secrets versions access latest --secret="database-url")
DIRECT_URL=$(gcloud secrets versions access latest --secret="direct-url")

# Prisma Studioでデータベースの状態を確認
DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" npx prisma studio

# ブラウザで http://localhost:5555 が開き、テーブルを確認できる
```

**方法B: 手動で接続文字列を指定**

```bash
# Prisma Studioでデータベースの状態を確認
DATABASE_URL="postgresql://postgres.dgyibghcbmwssafhlfol:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres" \
DIRECT_URL="postgresql://postgres.dgyibghcbmwssafhlfol:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" \
npx prisma studio

# ブラウザで http://localhost:5555 が開き、テーブルを確認できる
```

**確認項目**:
- [ ] `users`テーブルが作成されている
- [ ] `memos`テーブルが作成されている
- [ ] `notebooks`テーブルが作成されている
- [ ] `tags`テーブルが作成されている
- [ ] `invitation_codes`テーブルが作成されている
- [ ] `themes`テーブルが作成されている
- [ ] すべてのリレーションが正しく設定されている

### ステップ4.5.3: Prisma Clientの生成

マイグレーション後、Prisma Clientを生成します：

```bash
# バックエンドディレクトリで実行
cd backend
npx prisma generate

# 成果物が generated/prisma/ に生成される
ls -la generated/prisma/
```

### ✅ Phase 4.5 完了チェックリスト

- [ ] データベースマイグレーション成功
- [ ] Prisma Studioで全テーブル確認
- [ ] Prisma Client生成済み

---

## Phase 5: 動作確認

### ステップ5.1: バックエンドAPIのテスト

```bash
# ヘルスチェック
curl https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/health

# 期待される出力:
# {"status":"ok","timestamp":"..."}

# 認証エンドポイントのテスト（401エラーが正常）
curl https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/auth/me

# 期待される出力:
# {"statusCode":401,"message":"Authentication required"}
```

### ステップ5.2: フロントエンドアクセステスト

1. ブラウザで https://mosaku.vercel.app を開く
2. ページが正常に表示されることを確認
3. コンソールエラーがないか確認（F12 → Console）

### ステップ5.3: 認証フローのテスト

#### 招待コードの作成（初回のみ必要）

デプロイ後、初めてユーザー登録を行う前に、管理者が招待コードを作成する必要があります。

**方法1: データベースに直接挿入（推奨）**

```bash
# Supabase SQL Editorを使用
# Supabase Dashboard > SQL Editor > New query

-- 招待コードを作成（管理者ユーザーは後で作成されるため、仮のIDを使用）
INSERT INTO invitation_codes (id, code, max_uses, used_count, expires_at, created_by_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),           -- ランダムなID
  'WELCOME2024',               -- 招待コード（任意の文字列）
  100,                         -- 最大使用回数
  0,                           -- 使用回数（初期値0）
  NOW() + INTERVAL '30 days',  -- 有効期限（30日後）
  '00000000-0000-0000-0000-000000000000',  -- 仮のユーザーID（管理者作成前）
  NOW(),
  NOW()
);
```

**方法2: 管理者ユーザー作成後にAPIで作成**

```bash
# 管理者としてログイン後、招待コードを作成
curl -X POST https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/admin/invitations \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "WELCOME2024",
    "maxUses": 100,
    "expiresAt": "2024-12-31T23:59:59Z"
  }'
```

**管理者ユーザーの作成**

最初の管理者ユーザーは招待コードなしで作成できます（`ADMIN_EMAIL`に一致するメールアドレス）：

1. ブラウザで https://mosaku.vercel.app にアクセス
2. 「新規登録」をクリック
3. 管理者メールアドレス（`mosakuzii1928@gmail.com`）で登録
4. パスワードを設定
5. 自動的に`ADMIN`ロールが付与される

#### メール/パスワード認証
1. 「新規登録」をクリック
2. 招待コードを入力（上記で作成したコード）
3. メールアドレスとパスワードを入力
4. 登録成功を確認

#### OAuth認証（Google）
1. 「Googleでログイン」をクリック
2. Google認証画面が表示されることを確認
3. 認証後、アプリにリダイレクトされることを確認

### ステップ5.4: データベース接続のテスト

```bash
# Cloud Runのログを確認
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mosaku-backend" \
  --limit=20 \
  --format="table(timestamp,severity,textPayload)"

# Prisma接続エラーがないことを確認
```

### ステップ5.5: エンドツーエンドテスト

1. **ログイン**
   - メールアドレスでログイン
   - ダッシュボードに遷移

2. **メモ作成**
   - 新規メモを作成
   - 保存されることを確認

3. **ノートブック作成**
   - 新規ノートブックを作成
   - メモを移動できることを確認

4. **タグ機能**
   - タグを作成
   - メモにタグを付与

5. **テーマ変更**
   - テーマ一覧を表示
   - テーマを変更してUIが更新されることを確認

### ✅ Phase 5 完了チェックリスト

- [ ] バックエンドAPIが応答
- [ ] フロントエンドが正常に表示
- [ ] 認証フローが動作
- [ ] データベース接続が正常
- [ ] エンドツーエンドテストが通過

---

## トラブルシューティング

### 問題1: Cloud Runでデータベース接続エラー

**症状:**
```
PrismaClientInitializationError: Authentication failed against database server
```

**確認事項:**
1. Secret Managerの接続文字列が正しいか
   ```bash
   gcloud secrets versions access latest --secret=database-url
   ```

2. パスワードに特殊文字がある場合、URLエンコードされているか
   - `?` → `%3F`
   - `@` → `%40`
   - `#` → `%23`

3. Session Pooler（ポート5432）を使用しているか
   - Direct Connection（IPv6のみ）ではなくSession Poolerを使用

**解決方法:**
```bash
# 正しい接続文字列で更新
echo -n "正しい接続文字列" | \
  gcloud secrets versions add database-url --data-file=-

# Cloud Runを再デプロイ
gcloud run deploy mosaku-backend \
  --region=asia-northeast1 \
  --image=gcr.io/igneous-core-480923-j0/mosaku-backend:latest
```

### 問題2: CORSエラー

**症状:**
```
Access to fetch at 'https://...' has been blocked by CORS policy
```

**確認事項:**
1. Cloud RunのCORS_ORIGINS環境変数にフロントエンドURLが含まれているか
   ```bash
   gcloud run services describe mosaku-backend \
     --region=asia-northeast1 \
     --format="value(spec.template.spec.containers[0].env)"
   ```

**解決方法:**
```bash
# CORS設定を更新
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --update-env-vars="CORS_ORIGINS=https://mosaku.vercel.app,https://mosaku-XXXXXX.vercel.app"
```

### 問題3: OAuth認証が失敗

**症状:**
```
Invalid redirect URI
```

**確認事項:**
1. OAuthプロバイダーのリダイレクトURLが正しく設定されているか
2. バックエンドのURLが正しいか

**解決方法:**
- 各OAuthプロバイダーのコンソールでリダイレクトURLを確認・更新
- 形式: `https://mosaku-backend-XXXXX.asia-northeast1.run.app/auth/{provider}/callback`

### 問題4: Vercelビルドエラー

**症状:**
```
Build failed
```

**確認事項:**
1. 環境変数が正しく設定されているか
   ```bash
   vercel env ls
   ```

2. TypeScriptエラーがないか
   ```bash
   cd frontend
   npm run build
   ```

**解決方法:**
```bash
# ローカルでビルドテスト
npm run build

# エラーを修正してから再デプロイ
vercel --prod
```

### 問題5: Cloud Runのメモリ不足

**症状:**
```
Memory limit exceeded
```

**解決方法:**
```bash
# メモリを増やす（512Mi → 1Gi）
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --memory=1Gi
```

---

## 参考: 環境変数一覧

### バックエンド（Cloud Run）

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| NODE_ENV | production | 実行環境 |
| PORT | 8080 | アプリケーションポート |
| DATABASE_URL | postgresql://... | データベース接続（Transaction Pooler） |
| DIRECT_URL | postgresql://... | ダイレクト接続（Session Pooler） |
| SUPABASE_URL | https://...supabase.co | Supabase プロジェクトURL |
| SUPABASE_ANON_KEY | eyJhbG... | Supabase 匿名キー |
| JWT_SECRET | ランダム文字列 | JWT署名用シークレット |
| SESSION_SECRET | ランダム文字列 | セッション暗号化キー |
| FRONTEND_URL | https://mosaku.vercel.app | フロントエンドURL |
| CORS_ORIGINS | https://mosaku.vercel.app | CORS許可オリジン |
| GOOGLE_CLIENT_SECRET | ... | Google OAuth シークレット |
| GITHUB_CLIENT_SECRET | ... | GitHub OAuth シークレット |
| X_CONSUMER_SECRET | ... | X (Twitter) OAuth コンシューマーシークレット |
| X_ACCESS_TOKEN | ... | X (Twitter) アクセストークン（OAuth 1.0a用） |
| X_ACCESS_TOKEN_SECRET | ... | X (Twitter) アクセストークンシークレット |
| ADMIN_EMAIL | mosakuzii1928@gmail.com | 管理者メールアドレス |

### フロントエンド（Vercel）

| 変数名 | 値の例 | 説明 |
|--------|--------|------|
| VITE_BACKEND_URL | https://mosaku-backend-...run.app | バックエンドAPI URL |
| VITE_APP_URL | https://mosaku.vercel.app | アプリケーションURL |
| VITE_SUPABASE_URL | https://ninyjmahwnbtgqqjxcli.supabase.co | Supabase URL |
| VITE_SUPABASE_ANON_KEY | eyJhbG... | Supabase 匿名キー |
| VITE_GOOGLE_CLIENT_ID | ...apps.googleusercontent.com | Google OAuth クライアントID |
| VITE_GITHUB_CLIENT_ID | ... | GitHub OAuth クライアントID |
| VITE_X_CONSUMER_KEY | ... | X (Twitter) コンシューマーキー |

---

## 付録: よく使うコマンド

### Cloud Run管理

```bash
# サービス一覧
gcloud run services list

# サービス詳細
gcloud run services describe mosaku-backend --region=asia-northeast1

# ログ確認
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mosaku-backend" \
  --limit=50

# サービス削除
gcloud run services delete mosaku-backend --region=asia-northeast1
```

### Secret Manager管理

```bash
# シークレット一覧
gcloud secrets list

# シークレット作成
echo -n "値" | gcloud secrets create SECRET_NAME --data-file=-

# シークレット更新（新バージョン追加）
echo -n "新しい値" | gcloud secrets versions add SECRET_NAME --data-file=-

# シークレット内容確認（本番環境では非推奨）
gcloud secrets versions access latest --secret=SECRET_NAME
```

### Vercel管理

```bash
# デプロイ一覧
vercel ls

# 環境変数一覧
vercel env ls

# 環境変数削除
vercel env rm VARIABLE_NAME production

# ログ確認
vercel logs mosaku
```

---

## Phase 6: デプロイ後のメンテナンス

### ステップ6.1: 定期的なバックアップ

**Supabaseの自動バックアップ確認**:

1. Supabase Dashboard > Database > Backups
2. 自動バックアップが有効か確認（Proプラン以上で利用可能）
3. バックアップスケジュールを確認

**手動バックアップ（無料プランの場合）**:

```bash
# pg_dumpを使用したバックアップ
# Secret Managerから接続文字列を取得（推奨）
DIRECT_URL=$(gcloud secrets versions access latest --secret="direct-url")
pg_dump "$DIRECT_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# または手動で接続文字列を指定
# pg_dump "postgresql://postgres.dgyibghcbmwssafhlfol:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" > backup_$(date +%Y%m%d_%H%M%S).sql

# バックアップファイルの確認
ls -lh backup_*.sql
```

### ステップ6.2: ログ監視とアラート

**Cloud Runログの定期確認**:

```bash
# エラーログの確認（過去24時間）
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mosaku-backend AND severity>=ERROR" \
  --limit=100 \
  --format="table(timestamp,severity,textPayload)" \
  --freshness=1d

# 特定のエラーパターンを検索
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mosaku-backend AND textPayload:\"PrismaClientKnownRequestError\"" \
  --limit=50
```

**アラート設定の確認**:

1. Cloud Console > Monitoring > Alerting
2. 設定済みアラートポリシーを確認
3. 通知チャネル（メール、Slack等）が正しく設定されているか確認

### ステップ6.3: パフォーマンス監視

**Cloud Runメトリクスの確認**:

```bash
# Cloud Console > Cloud Run > mosaku-backend > Metrics
# 以下の項目を定期的に確認：
# - Request count（リクエスト数）
# - Request latency（レイテンシ）
# - Instance count（インスタンス数）
# - Memory utilization（メモリ使用率）
# - CPU utilization（CPU使用率）
# - Container startup latency（コールドスタート時間）
```

**Vercel Analyticsの確認**:

1. Vercel Dashboard > Project > Analytics
2. ページビュー、読み込み時間、Core Web Vitalsを確認
3. パフォーマンスの低下があれば調査

### ステップ6.4: 依存関係の更新

**月次の依存関係チェック**:

```bash
# バックエンドの依存関係チェック
cd backend
npm outdated

# セキュリティ脆弱性チェック
npm audit

# 自動修正可能な脆弱性を修正
npm audit fix

# フロントエンドも同様に
cd ../frontend
npm outdated
npm audit
npm audit fix
```

### ステップ6.5: デプロイの更新手順

**コードの更新をデプロイする際の手順**:

```bash
# 1. 最新のコードを取得
git pull origin main

# 2. バックエンドを更新する場合
cd backend

# 依存関係の更新
npm install

# ローカルでテスト
npm run test
npm run build

# Dockerイメージをビルド＆プッシュ
gcloud builds submit \
  --tag gcr.io/igneous-core-480923-j0/mosaku-backend:latest \
  --timeout=20m

# Cloud Runにデプロイ
gcloud run deploy mosaku-backend \
  --image=gcr.io/igneous-core-480923-j0/mosaku-backend:latest \
  --region=asia-northeast1

# デプロイ確認
curl https://mosaku-backend-XXXXXXXXX.asia-northeast1.run.app/health

# 3. フロントエンドを更新する場合
cd ../frontend

# 依存関係の更新
npm install

# ローカルでビルドテスト
npm run build

# Vercelにデプロイ（自動デプロイ設定の場合はgit pushのみ）
git add .
git commit -m "feat: update frontend"
git push origin main

# または手動デプロイ
vercel --prod

# 4. データベーススキーマの変更がある場合
cd ../backend

# マイグレーションファイルを作成
npx prisma migrate dev --name describe_your_changes

# 本番環境にマイグレーションを適用
DATABASE_URL=$(gcloud secrets versions access latest --secret="database-url")
DIRECT_URL=$(gcloud secrets versions access latest --secret="direct-url")
DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" npx prisma migrate deploy

# Prisma Client再生成
npx prisma generate

# バックエンドを再デプロイ（上記手順2を実行）
```

### ステップ6.6: ロールバック手順

**問題が発生した場合のロールバック**:

**Cloud Runのロールバック**:

```bash
# 過去のリビジョンを確認
gcloud run revisions list \
  --service=mosaku-backend \
  --region=asia-northeast1

# 特定のリビジョンにトラフィックを切り替え
gcloud run services update-traffic mosaku-backend \
  --region=asia-northeast1 \
  --to-revisions=mosaku-backend-00042-abc=100

# 確認
gcloud run services describe mosaku-backend \
  --region=asia-northeast1 \
  --format="value(status.traffic)"
```

**Vercelのロールバック**:

1. Vercel Dashboard > Deployments
2. 問題が発生する前のデプロイメントを見つける
3. デプロイメント詳細画面で「Promote to Production」をクリック
4. 確認

**データベースのロールバック（マイグレーション）**:

```bash
# ⚠️ 注意: Prismaは自動ロールバックをサポートしていません
# 手動でSQLを実行してスキーマを元に戻す必要があります

# バックアップから復元する場合
psql "postgresql://postgres.ninyjmahwnbtgqqjxcli:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" \
  < backup_20240115_120000.sql
```

### ✅ Phase 6 完了チェックリスト

- [ ] バックアップ手順を確認・実行
- [ ] ログ監視を設定
- [ ] パフォーマンス監視ダッシュボードを確認
- [ ] 依存関係の更新手順を確認
- [ ] デプロイ更新手順をドキュメント化
- [ ] ロールバック手順をテスト（必要に応じて）

---

## 付録A: 実際の環境情報

この手順書で使用されている実際のプロジェクト情報:

### Google Cloud
- **プロジェクトID**: `igneous-core-480923-j0`
- **リージョン**: `asia-northeast1` (東京)
- **Cloud Run サービス名**: `mosaku-backend`
- **既存デプロイURL**: `https://mosaku-backend-129805115778.asia-northeast1.run.app`

### Supabase
- **プロジェクトRef**: `dgyibghcbmwssafhlfol`
- **プロジェクトURL**: `https://dgyibghcbmwssafhlfol.supabase.co`
- **Connection Pooling (Transaction)**: ポート `6543`
- **Connection Pooling (Session)**: ポート `5432`
- **リージョン**: `aws-1-ap-south-1`

### Vercel
- **既存デプロイURL**: `https://frontend-mosakuziis-projects.vercel.app`
- **プロジェクト名**: `frontend`

### OAuth設定
- **Google OAuth**: 設定済み（Client ID: `129805115778-h1piranng380jqso9aav0c9jd115ttiu.apps.googleusercontent.com`）
- **GitHub OAuth**: 設定済み（Client ID: `Ov23li8ePGB7cCzkYX9Y`）
- **X (Twitter) OAuth**: 設定済み（Consumer Key: `y67KX3s6r2tugszdO0cc51k4D`）

### 管理者設定
- **管理者メール**: `mosakuzii1928@gmail.com`

---

## 付録B: クイックリファレンス

### よく使うコマンド一覧

**ログ確認（エラーのみ）**:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mosaku-backend AND severity>=ERROR" --limit=20
```

**ヘルスチェック**:
```bash
curl https://mosaku-backend-129805115778.asia-northeast1.run.app/health
```

**環境変数の確認**:
```bash
gcloud run services describe mosaku-backend --region=asia-northeast1 --format="value(spec.template.spec.containers[0].env)"
```

**リビジョン一覧**:
```bash
gcloud run revisions list --service=mosaku-backend --region=asia-northeast1
```

**シークレット一覧**:
```bash
gcloud secrets list
```

**シークレット内容確認**（本番環境では非推奨）:
```bash
gcloud secrets versions access latest --secret=database-url
```

**Vercelデプロイ一覧**:
```bash
vercel ls
```

**Vercel環境変数一覧**:
```bash
vercel env ls
```

**データベースマイグレーション**:
```bash
cd backend
# Secret Managerから取得（推奨）
DATABASE_URL=$(gcloud secrets versions access latest --secret="database-url")
DIRECT_URL=$(gcloud secrets versions access latest --secret="direct-url")
DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" npx prisma migrate deploy
```

**バックアップ作成**:
```bash
# Secret Managerから取得（推奨）
DIRECT_URL=$(gcloud secrets versions access latest --secret="direct-url")
pg_dump "$DIRECT_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## まとめ

この手順書に従うことで、Mosakuアプリケーションを以下の構成でデプロイできます:

- **バックエンド**: Google Cloud Run
- **フロントエンド**: Vercel
- **データベース**: Supabase PostgreSQL

各Phaseを順番に実行し、チェックリストで進捗を確認しながら進めてください。

問題が発生した場合は、トラブルシューティングセクションを参照してください。
