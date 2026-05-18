# Google Cloud Run バックエンドデプロイ計画

NestJS + Prisma バックエンドをGoogle Cloud Runにデプロイするための段階的な計画です。

## 📋 デプロイの全体フロー

```
Phase C1: Google Cloud準備・セットアップ（0.5日）
  ↓
Phase C2: Dockerfile・ビルド設定（0.5日）
  ↓
Phase C3: 環境変数・シークレット設定（0.5日）
  ↓
Phase C4: 初回デプロイ（1日）
  ↓
Phase C5: データベース・API統合（0.5日）
  ↓
Phase C6: モニタリング・CI/CD（0.5-1日）

合計: 3.5-4日
```

---

## 🎯 Phase C1: Google Cloud準備・セットアップ（0.5日）

### タスクC1.1: Google Cloudアカウント・プロジェクト準備

**作業内容**:

1. **Google Cloudアカウント作成**（まだの場合）
   - https://cloud.google.com/
   - 無料トライアル（$300クレジット、90日間）を有効化

2. **新規プロジェクトの作成**

   ```bash
   # Google Cloud Console (https://console.cloud.google.com/) でプロジェクト作成
   # プロジェクト名: mosaku-production
   # プロジェクトID: mosaku-prod-xxxxx（自動生成、メモしておく）
   ```

3. **課金の有効化**
   - プロジェクトに課金アカウントをリンク
   - 無料枠を超えた場合に備えて

**成果物**:

- ✅ GCPアカウント作成済み
- ✅ プロジェクト作成済み（プロジェクトIDをメモ）
- ✅ 課金有効化済み

---

### タスクC1.2: Google Cloud CLI（gcloud）のインストール

**作業内容**:

**macOSの場合**:

```bash
# Homebrewでインストール
brew install --cask google-cloud-sdk

# PATHを通す（~/.zshrc または ~/.bashrc に追加）
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"

# シェルを再起動
source ~/.zshrc

# バージョン確認
gcloud --version
```

**Linuxの場合**:

```bash
# 公式インストールスクリプト
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud --version
```

**認証とプロジェクト設定**:

```bash
# Google Cloudにログイン
gcloud auth login

# プロジェクトを設定
gcloud config set project mosaku-prod-xxxxx

# デフォルトリージョンを設定（東京）
gcloud config set run/region asia-northeast1

# 設定確認
gcloud config list
```

**成果物**:

- ✅ gcloud CLIインストール済み
- ✅ 認証完了
- ✅ プロジェクト・リージョン設定済み

---

### タスクC1.3: 必要なAPIの有効化

**作業内容**:

```bash
# Cloud Run API
gcloud services enable run.googleapis.com

# Artifact Registry API（コンテナイメージ保存用）
gcloud services enable artifactregistry.googleapis.com

# Cloud Build API（ビルド自動化用）
gcloud services enable cloudbuild.googleapis.com

# Secret Manager API（環境変数管理用）
gcloud services enable secretmanager.googleapis.com

# 有効化されたサービスを確認
gcloud services list --enabled
```

**成果物**:

- ✅ 必要なAPIがすべて有効化済み

---

### タスクC1.4: Artifact Registryリポジトリの作成

**作業内容**:

```bash
# Dockerリポジトリを作成
gcloud artifacts repositories create mosaku-backend \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Mosaku backend container images"

# 認証設定
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# リポジトリ確認
gcloud artifacts repositories list
```

**成果物**:

- ✅ Artifact Registryリポジトリ作成済み
- ✅ Docker認証設定済み

---

## 🔨 Phase C2: Dockerfile・ビルド設定（0.5日）

### タスクC2.1: Dockerfileの確認・最適化

**現在のDockerfileを確認**:

```bash
cat backend/Dockerfile
```

**Cloud Run用に最適化されたDockerfileを作成**: `backend/Dockerfile`

```dockerfile
# ===================================
# Stage 1: Dependencies
# ===================================
FROM node:18-alpine AS dependencies

WORKDIR /app

# package.json と package-lock.json をコピー
COPY package*.json ./

# 本番用依存関係のみインストール
RUN npm ci --only=production

# ===================================
# Stage 2: Build
# ===================================
FROM node:18-alpine AS build

WORKDIR /app

# package.json をコピー
COPY package*.json ./

# すべての依存関係をインストール（devDependencies含む）
RUN npm ci

# ソースコードをコピー
COPY . .

# Prisma Clientを生成
RUN npx prisma generate

# NestJSアプリをビルド
RUN npm run build

# ===================================
# Stage 3: Production
# ===================================
FROM node:18-alpine AS production

# 非rootユーザーを作成
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# 本番用依存関係をコピー
COPY --from=dependencies /app/node_modules ./node_modules

# ビルド成果物をコピー
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package*.json ./

# 所有者を変更
RUN chown -R nestjs:nodejs /app

# 非rootユーザーに切り替え
USER nestjs

# Cloud RunはPORT環境変数を提供（デフォルト8080）
ENV PORT=8080
ENV NODE_ENV=production

# ポート公開
EXPOSE 8080

# ヘルスチェック（オプション）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# アプリ起動
CMD ["node", "dist/main.js"]
```

**成果物**:

- ✅ Cloud Run最適化済みDockerfile

---

### タスクC2.2: .dockerignoreの作成

**新規ファイル作成**: `backend/.dockerignore`

```
# Dependencies
node_modules
npm-debug.log
yarn-error.log

# Build output
dist
build

# Environment files
.env
.env.*
!.env.example

# Development
.git
.gitignore
.vscode
.idea
.DS_Store
*.log

# Test files
coverage
test
*.test.ts
*.spec.ts

# Documentation
README.md
docs
*.md

# CI/CD
.github
.gitlab-ci.yml

# Database
prisma/migrations/*
!prisma/migrations/migration_lock.toml
```

**成果物**:

- ✅ `.dockerignore`作成済み

---

### タスクC2.3: ローカルDockerビルドのテスト

**作業内容**:

```bash
cd backend

# Dockerイメージをビルド
docker build -t mosaku-backend:test .

# ビルド成功確認
docker images | grep mosaku-backend

# イメージサイズ確認（重要: Cloud Runは最大10GBまで）
docker images mosaku-backend:test --format "{{.Size}}"

# ローカルでコンテナを起動してテスト
docker run -p 8080:8080 \
  -e DATABASE_URL="postgresql://..." \
  -e PORT=8080 \
  mosaku-backend:test

# 別のターミナルでヘルスチェック
curl http://localhost:8080/health
```

**確認項目**:

- ✅ ビルドエラーがない
- ✅ イメージサイズが妥当（通常200MB-1GB程度）
- ✅ ローカルで起動する
- ✅ ヘルスエンドポイントが応答する

**成果物**:

- ✅ ローカルDockerビルド成功

---

### タスクC2.4: cloudbuild.yamlの作成（オプション、CI/CD用）

**新規ファイル作成**: `backend/cloudbuild.yaml`

```yaml
steps:
  # Step 1: Dockerイメージをビルド
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/mosaku-backend/api:$COMMIT_SHA'
      - '-t'
      - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/mosaku-backend/api:latest'
      - '.'
    dir: 'backend'

  # Step 2: イメージをArtifact Registryにプッシュ
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/mosaku-backend/api:$COMMIT_SHA'

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/mosaku-backend/api:latest'

  # Step 3: Cloud Runにデプロイ
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'mosaku-backend'
      - '--image=asia-northeast1-docker.pkg.dev/$PROJECT_ID/mosaku-backend/api:$COMMIT_SHA'
      - '--region=asia-northeast1'
      - '--platform=managed'

images:
  - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/mosaku-backend/api:$COMMIT_SHA'
  - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/mosaku-backend/api:latest'

options:
  machineType: 'N1_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY
```

**成果物**:

- ✅ `cloudbuild.yaml`作成済み（CI/CD用）

---

## 🔐 Phase C3: 環境変数・シークレット設定（0.5日）

### タスクC3.1: Secret Managerへのシークレット登録

**作業内容**:

**重要なシークレットをSecret Managerに保存**:

```bash
# DATABASE_URL（Supabase接続文字列）
echo -n "postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true" | \
gcloud secrets create database-url --data-file=-

# DIRECT_URL（マイグレーション用）
echo -n "postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" | \
gcloud secrets create direct-url --data-file=-

# SUPABASE_ANON_KEY
echo -n "eyJhbGci..." | \
gcloud secrets create supabase-anon-key --data-file=-

# JWT_SECRET（認証移行前の場合のみ）
echo -n "your-jwt-secret-here" | \
gcloud secrets create jwt-secret --data-file=-

# SESSION_SECRET（認証移行前の場合のみ）
echo -n "your-session-secret-here" | \
gcloud secrets create session-secret --data-file=-

# シークレット一覧を確認
gcloud secrets list
```

**シークレットへのアクセス権限を設定**:

```bash
# Cloud Runサービスアカウントに権限を付与（後でサービスアカウント作成後に実行）
PROJECT_NUMBER=$(gcloud projects describe mosaku-prod-xxxxx --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding database-url \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 他のシークレットにも同様に権限付与
gcloud secrets add-iam-policy-binding direct-url \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding supabase-anon-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**成果物**:

- ✅ すべてのシークレットがSecret Managerに保存済み
- ✅ アクセス権限設定済み

---

### タスクC3.2: 環境変数リストの作成

**新規ファイル作成**: `backend/CLOUD_RUN_ENV_VARS.md`

````markdown
# Cloud Run環境変数設定リスト

## シークレット（Secret Manager経由）

| 変数名              | Secret Manager名    | 説明                                             |
| ------------------- | ------------------- | ------------------------------------------------ |
| `DATABASE_URL`      | `database-url`      | Supabase接続文字列（Connection Pooling）         |
| `DIRECT_URL`        | `direct-url`        | Supabase接続文字列（Direct、マイグレーション用） |
| `SUPABASE_ANON_KEY` | `supabase-anon-key` | Supabase匿名キー                                 |
| `JWT_SECRET`        | `jwt-secret`        | JWT署名用シークレット（認証移行前のみ）          |
| `SESSION_SECRET`    | `session-secret`    | セッション暗号化用（認証移行前のみ）             |

## 環境変数（平文）

| 変数名         | 値                                                              | 説明                                |
| -------------- | --------------------------------------------------------------- | ----------------------------------- |
| `NODE_ENV`     | `production`                                                    | 実行環境                            |
| `PORT`         | `8080`                                                          | Cloud Runが自動設定（通常変更不要） |
| `SUPABASE_URL` | `https://pxrouvdpdffdfoitmoyv.supabase.co`                      | Supabase URL                        |
| `CORS_ORIGINS` | `https://[YOUR-APP].vercel.app,https://[YOUR-APP]-*.vercel.app` | CORS許可オリジン                    |
| `ADMIN_EMAIL`  | `admin@example.com`                                             | 管理者メールアドレス                |
| `FRONTEND_URL` | `https://[YOUR-APP].vercel.app`                                 | フロントエンドURL                   |

## OAuth設定（認証移行前のみ、オプション）

| 変数名                 | 値                                           | 説明                   |
| ---------------------- | -------------------------------------------- | ---------------------- |
| `GOOGLE_CLIENT_ID`     | `xxx.apps.googleusercontent.com`             | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Secret Manager: `google-client-secret`       | Google OAuth Secret    |
| `GOOGLE_REDIRECT_URI`  | `https://[SERVICE-URL]/auth/google/callback` | Google Redirect URI    |
| `GITHUB_CLIENT_ID`     | `Iv1.xxxxx`                                  | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | Secret Manager: `github-client-secret`       | GitHub OAuth Secret    |
| `GITHUB_REDIRECT_URI`  | `https://[SERVICE-URL]/auth/github/callback` | GitHub Redirect URI    |

## デプロイコマンド例

```bash
gcloud run deploy mosaku-backend \
  --image=asia-northeast1-docker.pkg.dev/mosaku-prod-xxxxx/mosaku-backend/api:latest \
  --region=asia-northeast1 \
  --platform=managed \
  --set-env-vars="NODE_ENV=production,SUPABASE_URL=https://pxrouvdpdffdfoitmoyv.supabase.co,CORS_ORIGINS=https://yourapp.vercel.app" \
  --set-secrets="DATABASE_URL=database-url:latest,DIRECT_URL=direct-url:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest"
```
````

````

**成果物**:
- ✅ `CLOUD_RUN_ENV_VARS.md`作成済み

---

### タスクC3.3: 本番用.envテンプレートの作成

**新規ファイル作成**: `backend/.env.cloudrun.template`

```bash
# ===================================
# Backend Cloud Run Environment Variables Template
# ===================================
# これらの値はCloud RunのSecret Managerまたは環境変数で設定

# Node Environment
NODE_ENV=production
PORT=8080

# Supabase Settings
SUPABASE_URL=https://pxrouvdpdffdfoitmoyv.supabase.co
SUPABASE_ANON_KEY=<Secret Manager: supabase-anon-key>

# Database (Supabase PostgreSQL)
DATABASE_URL=<Secret Manager: database-url>
DIRECT_URL=<Secret Manager: direct-url>

# CORS Settings
CORS_ORIGINS=https://[YOUR-APP].vercel.app,https://[YOUR-APP]-git-*.vercel.app
FRONTEND_URL=https://[YOUR-APP].vercel.app

# Admin Settings
ADMIN_EMAIL=admin@example.com

# JWT & Session (認証移行前のみ)
JWT_SECRET=<Secret Manager: jwt-secret>
SESSION_SECRET=<Secret Manager: session-secret>

# OAuth (認証移行前のみ、オプション)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<Secret Manager: google-client-secret>
GOOGLE_REDIRECT_URI=https://[SERVICE-URL].a.run.app/auth/google/callback

GITHUB_CLIENT_ID=Iv1.xxxxx
GITHUB_CLIENT_SECRET=<Secret Manager: github-client-secret>
GITHUB_REDIRECT_URI=https://[SERVICE-URL].a.run.app/auth/github/callback
````

**成果物**:

- ✅ `.env.cloudrun.template`作成済み

---

## 🚀 Phase C4: 初回デプロイ（1日）

### タスクC4.1: コンテナイメージのビルド・プッシュ

**作業内容**:

```bash
cd backend

# プロジェクトIDを設定（置き換えてください）
PROJECT_ID="mosaku-prod-xxxxx"
REGION="asia-northeast1"
IMAGE_NAME="mosaku-backend/api"

# イメージタグを定義
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_NAME}:latest"

# Dockerイメージをビルド
docker build -t ${IMAGE_TAG} .

# Artifact Registryにプッシュ
docker push ${IMAGE_TAG}

# プッシュ確認
gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_NAME}
```

**成果物**:

- ✅ コンテナイメージがArtifact Registryにプッシュ済み

---

### タスクC4.2: Cloud Runサービスの初回デプロイ

**作業内容**:

```bash
PROJECT_ID="mosaku-prod-xxxxx"
REGION="asia-northeast1"
SERVICE_NAME="mosaku-backend"
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/mosaku-backend/api:latest"

# Cloud Runにデプロイ
gcloud run deploy ${SERVICE_NAME} \
  --image=${IMAGE_TAG} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=300 \
  --set-env-vars="NODE_ENV=production,PORT=8080,SUPABASE_URL=https://pxrouvdpdffdfoitmoyv.supabase.co" \
  --set-secrets="DATABASE_URL=database-url:latest,DIRECT_URL=direct-url:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest"

# デプロイ完了後、サービスURLが表示される
# 例: https://mosaku-backend-xxxxx-an.a.run.app
```

**デプロイ設定の説明**:

- `--allow-unauthenticated`: パブリックアクセス許可（フロントエンドから呼び出すため）
- `--cpu=1`: 1vCPU（必要に応じて調整）
- `--memory=512Mi`: 512MBメモリ（必要に応じて調整）
- `--min-instances=1`: 常時1インスタンス起動（コールドスタート防止 / UptimeRobot 誤検知防止）
- `--max-instances=10`: 最大10インスタンス（負荷に応じてスケール）
- `--timeout=300`: タイムアウト5分

**成果物**:

- ✅ Cloud Runサービスがデプロイ済み
- ✅ サービスURLを取得（例: `https://mosaku-backend-xxxxx-an.a.run.app`）

---

### タスクC4.3: デプロイの動作確認

**作業内容**:

```bash
# サービスURLを取得
SERVICE_URL=$(gcloud run services describe mosaku-backend \
  --region=asia-northeast1 \
  --format="value(status.url)")

echo "Service URL: ${SERVICE_URL}"

# ヘルスチェック
curl ${SERVICE_URL}/health

# API動作確認（例: メモ一覧取得 - 認証が必要な場合は要トークン）
curl ${SERVICE_URL}/memo

# ログを確認
gcloud run logs read mosaku-backend --region=asia-northeast1 --limit=50
```

**確認項目**:

- ✅ ヘルスエンドポイントが200を返す
- ✅ ログにエラーがない
- ✅ サービスが正常に起動している

**成果物**:

- ✅ 初回デプロイ動作確認完了

---

### タスクC4.4: リソース設定の最適化

**パフォーマンステスト後に調整**:

**CPU・メモリの調整**:

```bash
# より高いスペックが必要な場合
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --cpu=2 \
  --memory=1Gi
```

**スケーリング設定の調整**:

```bash
# 常に1インスタンス起動（コールドスタート回避、コストは上がる）
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --min-instances=1

# 最大インスタンス数を増やす（高負荷時）
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --max-instances=50
```

**同時実行数の調整**:

```bash
# 1インスタンスあたりの同時リクエスト数（デフォルト80）
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --concurrency=100
```

**成果物**:

- ✅ リソース設定が最適化済み

---

## ⚙️ Phase C5: データベース・API統合（0.5日）

### タスクC5.1: Supabase接続の確認

**作業内容**:

**Prismaマイグレーションの実行**（必要な場合）:

```bash
# ローカルからSupabaseに対してマイグレーション実行
cd backend

# DIRECT_URLを使用してマイグレーション
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" \
npx prisma migrate deploy

# Prisma Studioでデータ確認
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" \
npx prisma studio
```

**Cloud Runからのデータベース接続テスト**:

```bash
# サービスURLを取得
SERVICE_URL=$(gcloud run services describe mosaku-backend \
  --region=asia-northeast1 \
  --format="value(status.url)")

# データベース接続を必要とするエンドポイントをテスト
curl ${SERVICE_URL}/memo

# ログでPrisma接続を確認
gcloud run logs read mosaku-backend --region=asia-northeast1 --limit=100 | grep -i "prisma\|database"
```

**確認項目**:

- ✅ Prismaがデータベースに接続できている
- ✅ クエリが正常に実行される
- ✅ 接続プーリングが動作している

**成果物**:

- ✅ Supabase接続確認完了

---

### タスクC5.2: CORS設定の確認・調整

**backend/src/main.tsを確認**:

```bash
cat backend/src/main.ts | grep -A 10 "enableCors"
```

**CORS設定が正しいか確認**:

```typescript
// backend/src/main.ts
app.enableCors({
	origin: configService.corsOrigins, // Vercel URLsが含まれているか
	credentials: true,
});
```

**環境変数でCORS_ORIGINSを設定**:

```bash
# Vercel URLを含めて更新
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --set-env-vars="CORS_ORIGINS=https://yourapp.vercel.app,https://yourapp-git-*.vercel.app"
```

**Vercelフロントエンドからテスト**:

```bash
# Vercelフロントエンドのブラウザコンソールで実行
fetch('https://mosaku-backend-xxxxx-an.a.run.app/memo', {
  method: 'GET',
  credentials: 'include',
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

**確認項目**:

- ✅ CORSエラーが発生しない
- ✅ ブラウザからAPIリクエストが成功する

**成果物**:

- ✅ CORS設定完了

---

### タスクC5.3: フロントエンドとの統合テスト

**Vercel環境変数を更新**:

```bash
# Vercel Dashboard > Project Settings > Environment Variables
# VITE_BACKEND_URL を更新

変数名: VITE_BACKEND_URL
値（Production）: https://mosaku-backend-xxxxx-an.a.run.app
環境: Production
```

**Vercelを再デプロイ**:

- Vercel Dashboard > Deployments > Latest > Redeploy

**E2Eテスト**:

1. Vercel URLにアクセス
2. ログイン
3. メモ作成・編集・削除
4. ノートブック操作
5. タグ操作

**確認項目**:

- ✅ フロントエンドからバックエンドAPIが呼び出せる
- ✅ すべてのCRUD操作が動作する
- ✅ 認証が正常に動作する

**成果物**:

- ✅ フロントエンド・バックエンド統合完了

---

### タスクC5.4: パフォーマンステスト

**負荷テスト（オプション）**:

**Apache Benchを使用**:

```bash
# 100リクエスト、同時実行10
ab -n 100 -c 10 https://mosaku-backend-xxxxx-an.a.run.app/health

# 結果を確認
# - Requests per second
# - Time per request
# - Failed requests
```

**Cloud Runメトリクスを確認**:

```bash
# Cloud Console > Cloud Run > mosaku-backend > Metrics
# - リクエスト数
# - レイテンシ
# - インスタンス数
# - メモリ使用率
# - CPU使用率
```

**ボトルネック分析**:

- メモリ不足 → メモリを増やす
- CPU高負荷 → CPUを増やす、またはコード最適化
- コールドスタート遅延 → min-instances を1に

**成果物**:

- ✅ パフォーマンステスト完了
- ✅ 必要に応じてリソース調整済み

---

## 📊 Phase C6: モニタリング・CI/CD（0.5-1日）

### タスクC6.1: Cloud Loggingの設定

**ログの確認**:

```bash
# 最新50件のログを取得
gcloud run logs read mosaku-backend \
  --region=asia-northeast1 \
  --limit=50

# エラーログのみ表示
gcloud run logs read mosaku-backend \
  --region=asia-northeast1 \
  --limit=100 | grep -i "error\|exception"

# 特定の時間範囲のログ
gcloud run logs read mosaku-backend \
  --region=asia-northeast1 \
  --limit=100 \
  --start-time="2025-01-01T00:00:00Z"
```

**ログベースのアラート作成**（Cloud Console）:

1. **Logging > Logs Explorer**
2. フィルタを作成:
   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name="mosaku-backend"
   severity>=ERROR
   ```
3. 「Create alert」をクリック
4. アラート条件を設定:
   - Threshold: 5 errors in 1 minute
   - Notification: メール通知

**成果物**:

- ✅ ログ監視設定済み
- ✅ エラーアラート設定済み

---

### タスクC6.2: Sentry エラー監視の設定

> Sentry の運用手順（プロジェクト作成 / Alert Rule / smoke test / PII / サンプリング率）は **[docs/deployment/sentry.md](./sentry.md) が single source of truth**。本セクションは Cloud Run 固有の env / Secret 投入チェックリストのみ残す。

#### Cloud Run に投入する Sentry 関連 env / Secret

| 種別                    | キー                                                        | 投入元                                        |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Secret Manager          | `SENTRY_DSN`                                                | `sentry-dsn` Secret（`--update-secrets`）     |
| `--set-env-vars` で投入 | `SENTRY_ENVIRONMENT`                                        | 固定 `production`                             |
| `--set-env-vars` で投入 | `SENTRY_RELEASE`                                            | CI から `${{ github.sha }}`                   |
| `--set-env-vars` で投入 | `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE` | 既定 `0.1`（quota 逼迫時は `sentry.md` §5.3） |

```bash
# DSN を Secret Manager に登録（初回のみ）
echo -n "https://<public-key>@<org>.ingest.sentry.io/<project-id>" \
  | gcloud secrets create sentry-dsn --data-file=- --project=mosaku-prod

# Cloud Run サービスアカウントに secretAccessor 権限を付与
gcloud secrets add-iam-policy-binding sentry-dsn \
  --member="serviceAccount:<service-account-email>" \
  --role="roles/secretmanager.secretAccessor" \
  --project=mosaku-prod
```

`deploy-backend.yml` が上記 env / Secret を Cloud Run にデプロイ時に投入する。プロジェクト作成・Alert Rule・smoke test 手順は **[sentry.md §1〜§4](./sentry.md)** を参照。

**成果物**:

- ✅ `sentry-dsn` Secret 登録済み + サービスアカウントに `secretAccessor` 権限
- ✅ Cloud Run サービスに Sentry 関連 env が投入される CI 設定

---

### タスクC6.3: ヘルスチェックエンドポイントの実装

**既存のヘルスチェックを確認**:

```bash
grep -r "health" backend/src
```

**なければ作成**: `backend/src/health/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
	@Public()
	@Get()
	check() {
		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: process.env.NODE_ENV,
		};
	}

	@Public()
	@Get('ready')
	ready() {
		// データベース接続などの準備状態を確認
		return { status: 'ready' };
	}

	@Public()
	@Get('live')
	live() {
		// アプリケーションが生きているかの確認
		return { status: 'alive' };
	}
}
```

**AppModuleに追加**:

```typescript
// backend/src/app.module.ts
import { HealthController } from './health/health.controller';

@Module({
	controllers: [HealthController],
	// ...
})
export class AppModule {}
```

**Cloud Runのヘルスチェック設定**:

```bash
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --startup-cpu-boost \
  --health-check-path=/health
```

**成果物**:

- ✅ ヘルスチェックエンドポイント実装済み

---

### タスクC6.4: GitHub Actions CI/CDの設定（オプション）

**新規ファイル作成**: `.github/workflows/deploy-backend.yml`

```yaml
name: Deploy Backend to Cloud Run

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
  workflow_dispatch:

env:
  PROJECT_ID: mosaku-prod-xxxxx
  REGION: asia-northeast1
  SERVICE_NAME: mosaku-backend
  REPOSITORY: mosaku-backend
  IMAGE_NAME: api

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for Artifact Registry
        run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

      - name: Build Docker image
        run: |
          docker build \
            -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest \
            backend/

      - name: Push Docker image
        run: |
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE_NAME }} \
            --image=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --region=${{ env.REGION }} \
            --platform=managed

      - name: Show service URL
        run: |
          echo "Deployment complete!"
          gcloud run services describe ${{ env.SERVICE_NAME }} \
            --region=${{ env.REGION }} \
            --format="value(status.url)"
```

**Workload Identity Federation設定**（推奨、サービスアカウントキー不要）:

```bash
# Workload Identity Poolを作成
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions Pool"

# Workload Identity Providerを作成
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository"

# サービスアカウント作成
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Service Account"

# サービスアカウントに権限付与
gcloud projects add-iam-policy-binding mosaku-prod-xxxxx \
  --member="serviceAccount:github-actions@mosaku-prod-xxxxx.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding mosaku-prod-xxxxx \
  --member="serviceAccount:github-actions@mosaku-prod-xxxxx.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Workload Identityバインディング
gcloud iam service-accounts add-iam-policy-binding github-actions@mosaku-prod-xxxxx.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR-USERNAME/mosaku"
```

**GitHub Secretsに追加**:

```
WIF_PROVIDER: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
WIF_SERVICE_ACCOUNT: github-actions@mosaku-prod-xxxxx.iam.gserviceaccount.com
```

**成果物**:

- ✅ GitHub Actions CI/CD設定済み（オプション）
- ✅ mainブランチプッシュで自動デプロイ

---

## ✅ Phase C完了チェックリスト

### Phase C1: Google Cloud準備

- [ ] GCPアカウント・プロジェクト作成済み
- [ ] gcloud CLIインストール・認証済み
- [ ] 必要なAPI有効化済み
- [ ] Artifact Registryリポジトリ作成済み

### Phase C2: Dockerfile・ビルド設定

- [ ] Cloud Run最適化Dockerfile作成済み
- [ ] .dockerignore作成済み
- [ ] ローカルDockerビルド成功
- [ ] cloudbuild.yaml作成済み（オプション）

### Phase C3: 環境変数・シークレット

- [ ] Secret Managerにシークレット登録済み
- [ ] アクセス権限設定済み
- [ ] 環境変数リスト作成済み

### Phase C4: 初回デプロイ

- [ ] コンテナイメージプッシュ済み
- [ ] Cloud Runサービスデプロイ済み
- [ ] デプロイ動作確認完了
- [ ] リソース設定最適化済み

### Phase C5: データベース・API統合

- [ ] Supabase接続確認済み
- [ ] CORS設定完了
- [ ] フロントエンド統合完了
- [ ] パフォーマンステスト完了

### Phase C6: モニタリング・CI/CD

- [ ] Cloud Logging設定済み
- [ ] エラー監視設定済み（オプション）
- [ ] ヘルスチェック実装済み
- [ ] GitHub Actions CI/CD設定済み（オプション）

---

## 💰 コスト見積もり

**Cloud Run料金**（東京リージョン、2024年1月時点）:

**無料枠**:

- 月間200万リクエスト
- 360,000 vCPU秒
- 180,000 GiB秒

**有料料金**（無料枠超過後）:

- リクエスト: $0.40 / 100万リクエスト
- CPU: $0.00002400 / vCPU秒
- メモリ: $0.00000250 / GiB秒

**試算例**（月間100万リクエスト、平均応答時間200ms、1vCPU/512MB）:

- リクエスト: 無料枠内
- CPU: 100万 × 0.2秒 × $0.000024 = $4.8
- メモリ: 100万 × 0.2秒 × 0.5GB × $0.0000025 = $0.25
- **合計: 約$5/月**

**Artifact Registry料金**:

- ストレージ: $0.10 / GB/月（最初の0.5GBは無料）
- イメージサイズ500MBの場合: $0.05/月

**Secret Manager料金**:

- アクティブなシークレット: $0.06 / シークレット/月
- シークレット5個の場合: $0.30/月

**予想月額料金: $5-10**（トラフィック次第）

---

## 🛡️ トラブルシューティング

### ビルドエラー

**問題**: Dockerビルドが失敗する

**解決策**:

```bash
# ビルドログを詳細表示
docker build --progress=plain -t test .

# キャッシュなしでビルド
docker build --no-cache -t test .

# マルチステージビルドの特定ステージのみビルド
docker build --target=build -t test .
```

### デプロイエラー

**問題**: Cloud Runデプロイが失敗する

**解決策**:

```bash
# デプロイログを確認
gcloud run logs read mosaku-backend --region=asia-northeast1

# サービスの詳細を確認
gcloud run services describe mosaku-backend --region=asia-northeast1

# イメージが正しくプッシュされているか確認
gcloud artifacts docker images list asia-northeast1-docker.pkg.dev/mosaku-prod-xxxxx/mosaku-backend/api
```

### データベース接続エラー

**問題**: PrismaがSupabaseに接続できない

**解決策**:

1. DATABASE_URLが正しいか確認（特にConnection Pooling URL）
2. Secret Managerの権限を確認
3. Supabase IPホワイトリスト確認（通常不要だが、設定している場合）
4. ログでPrismaエラーを確認:
   ```bash
   gcloud run logs read mosaku-backend --region=asia-northeast1 | grep -i "prisma\|p2002\|p2003"
   ```

### CORSエラー

**問題**: フロントエンドからのAPIリクエストでCORSエラー

**解決策**:

1. CORS_ORIGINS環境変数にVercel URLが含まれているか確認
2. ワイルドカード使用: `https://*.vercel.app`
3. `credentials: true`が設定されているか確認
4. 再デプロイ（環境変数変更後）

### コールドスタート遅延

**問題**: 初回リクエストが遅い（5秒以上）/ UptimeRobot 等の外形監視が間欠的に Down 判定（"DNS Resolving problem" 表記になることもある）

**解決策**:

```bash
# 最小インスタンス数を1に設定（コスト増加あり）
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --min-instances=1

# または、startup-cpu-boostを有効化（無料）
gcloud run services update mosaku-backend \
  --region=asia-northeast1 \
  --startup-cpu-boost
```

> Phase 1（2026-05）で UptimeRobot の間欠 Down を解消するため `--min-instances=1` を本番に適用済み。GitHub Actions のデプロイは `--update-env-vars` / `--update-secrets` のみ指定で既存値を保持するため、毎回のデプロイで上書きされない。

---

## 📝 次のアクション

Cloud Runデプロイを開始しますか？

準備ができたら「Phase C1を開始します」と伝えてください。

全体の移行計画については以下のドキュメントを参照:

- **SUPABASE_FULL_MIGRATION_PLAN.md** - データベース移行
- **SUPABASE_AUTH_MIGRATION_PLAN.md** - 認証移行
- **VERCEL_DEPLOYMENT_PLAN.md** - フロントエンドデプロイ
- **CLOUD_RUN_DEPLOYMENT_PLAN.md** - バックエンドデプロイ（このドキュメント）
