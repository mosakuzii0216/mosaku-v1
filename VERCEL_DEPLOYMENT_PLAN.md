# Vercel フロントエンドデプロイ計画

React + Vite フロントエンドをVercelにデプロイするための段階的な計画です。

## 📋 デプロイの全体フロー

```
Phase V1: Vercel準備・セットアップ（0.5日）
  ↓
Phase V2: ローカルビルド検証（0.5日）
  ↓
Phase V3: Vercelプロジェクト作成・初回デプロイ（1日）
  ↓
Phase V4: 環境変数設定・本番デプロイ（0.5日）
  ↓
Phase V5: 動作確認・最適化（0.5日）
  ↓
Phase V6: カスタムドメイン・CI/CD（オプション、0.5-1日）

合計: 3-4日
```

---

## 🎯 Phase V1: Vercel準備・セットアップ（0.5日）

### タスクV1.1: Vercelアカウント・CLI準備

**作業内容**:

1. **Vercelアカウント作成**（まだの場合）
   - https://vercel.com/signup
   - GitHubアカウントで連携推奨

2. **Vercel CLIインストール**
```bash
npm install -g vercel

# ログイン
vercel login
```

3. **GitHubリポジトリの確認**
```bash
# リポジトリがGitHubにプッシュ済みか確認
git remote -v

# まだの場合は、GitHubにリポジトリ作成してプッシュ
git remote add origin https://github.com/[YOUR-USERNAME]/mosaku.git
git push -u origin main
```

**成果物**:
- ✅ Vercelアカウント作成済み
- ✅ Vercel CLIインストール済み
- ✅ GitHubリポジトリがプッシュ済み

---

### タスクV1.2: vercel.json設定ファイルの作成

**新規ファイル作成**: `frontend/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/themes/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=604800"
        }
      ]
    }
  ],
  "git": {
    "deploymentEnabled": true
  }
}
```

**説明**:
- `rewrites`: SPAルーティング対応（すべてのパスを`/index.html`に）
- `headers`: 静的アセットのキャッシュ最適化
- `git.deploymentEnabled`: GitHubプッシュで自動デプロイ

**成果物**:
- ✅ `frontend/vercel.json`作成済み

---

### タスクV1.3: .vercelignoreの作成

**新規ファイル作成**: `frontend/.vercelignore`

```
# Dependencies
node_modules

# Environment files
.env
.env.local
.env.*.local

# Build output (Vercel will build)
dist

# Development
.DS_Store
*.log

# IDE
.vscode
.idea
```

**成果物**:
- ✅ `frontend/.vercelignore`作成済み

---

## 🔨 Phase V2: ローカルビルド検証（0.5日）

### タスクV2.1: プロダクションビルドのテスト

**作業内容**:

```bash
cd frontend

# 依存関係が最新か確認
npm install

# プロダクションビルド
npm run build

# ビルド成果物を確認
ls -lh dist/

# ビルドサイズを確認（重要）
du -sh dist/
```

**確認項目**:
- ✅ ビルドエラーがない
- ✅ `dist/`ディレクトリが生成される
- ✅ distサイズが妥当（通常1-5MB程度）

**成果物**:
- ✅ ローカルでプロダクションビルド成功

---

### タスクV2.2: ローカルプレビュー

**作業内容**:

```bash
# ビルド済みファイルをプレビュー
npm run preview

# ブラウザで http://localhost:4173 にアクセス
```

**確認項目**:
- [ ] トップページが表示される
- [ ] ルーティングが動作する（/login, /memoなど）
- [ ] 静的アセット（画像、CSS）が読み込まれる
- [ ] テーマCSSが読み込まれる
- [ ] PWAマニフェストが読み込まれる

**問題がある場合の対処**:
- ビルド設定を確認（vite.config.ts）
- public/フォルダの構成を確認
- コンソールエラーを確認

**成果物**:
- ✅ ローカルプレビューで正常動作確認

---

### タスクV2.3: 環境変数の整理

**現在の環境変数を確認**:

```bash
# frontend/.env の内容を確認
cat frontend/.env
```

**本番用環境変数テンプレートを作成**: `frontend/.env.production.template`

```bash
# ===================================
# Frontend Production Environment Variables
# ===================================
# Vercel Dashboard > Project Settings > Environment Variables で設定

# Supabase Settings
VITE_SUPABASE_URL=https://[PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=[YOUR-SUPABASE-ANON-KEY]

# Backend API URL (Cloud Run)
VITE_BACKEND_URL=https://[YOUR-SERVICE]-[REGION]-[PROJECT-ID].a.run.app

# Frontend URL (Vercel)
VITE_APP_URL=https://[YOUR-APP].vercel.app

# OAuth Client IDs (本番環境用)
VITE_GOOGLE_CLIENT_ID=[YOUR-PRODUCTION-GOOGLE-CLIENT-ID]
VITE_GITHUB_CLIENT_ID=[YOUR-PRODUCTION-GITHUB-CLIENT-ID]
VITE_X_CONSUMER_KEY=[YOUR-PRODUCTION-X-CONSUMER-KEY]
```

**環境変数リストを作成**: `frontend/VERCEL_ENV_VARS.md`

```markdown
# Vercel環境変数設定リスト

以下の環境変数をVercel Dashboard > Project Settings > Environment Variablesで設定してください。

## 必須環境変数

| 変数名 | 値 | 環境 |
|--------|-----|------|
| `VITE_SUPABASE_URL` | `https://pxrouvdpdffdfoitmoyv.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` | Production, Preview, Development |
| `VITE_BACKEND_URL` | 本番: `https://xxx.run.app`<br>開発: `http://localhost:3000` | Production: 本番URL<br>Preview/Dev: localhost |
| `VITE_APP_URL` | 本番: `https://yourapp.vercel.app`<br>開発: `http://localhost:5173` | Production: Vercel URL<br>Preview/Dev: localhost |

## OAuth関連（オプション）

| 変数名 | 値 | 環境 |
|--------|-----|------|
| `VITE_GOOGLE_CLIENT_ID` | 本番用Client ID | Production |
| `VITE_GITHUB_CLIENT_ID` | 本番用Client ID | Production |
| `VITE_X_CONSUMER_KEY` | 本番用Consumer Key | Production |

## 設定方法

1. Vercel Dashboard > Your Project > Settings > Environment Variables
2. 上記の変数を1つずつ追加
3. 各変数ごとに対象環境（Production/Preview/Development）を選択
```

**成果物**:
- ✅ `.env.production.template`作成済み
- ✅ `VERCEL_ENV_VARS.md`作成済み

---

## 🚀 Phase V3: Vercelプロジェクト作成・初回デプロイ（1日）

### タスクV3.1: Vercelプロジェクトの作成（GitHubインテグレーション）

**作業内容（推奨方法）**:

1. **Vercel Dashboardからプロジェクト作成**
   - https://vercel.com/dashboard にアクセス
   - 「Add New...」→「Project」をクリック
   - 「Import Git Repository」でGitHubを選択
   - `mosaku`リポジトリを選択

2. **プロジェクト設定**
   ```
   Framework Preset: Vite
   Root Directory: frontend
   Build Command: npm run build
   Output Directory: dist
   Install Command: npm install
   ```

3. **環境変数は後で設定**（まずはスキップ）

4. **Deploy**をクリック

**初回デプロイの確認**:
- ビルドログを確認（エラーがないか）
- デプロイURLにアクセス（`https://mosaku-xxx.vercel.app`）
- 画面が表示されるか確認（API接続なしでも基本表示はされるはず）

**成果物**:
- ✅ Vercelプロジェクト作成済み
- ✅ 初回デプロイ成功
- ✅ デプロイURLでアクセス可能

---

### タスクV3.2: ビルド設定の最適化

**Vercel Dashboard > Project Settings > General**で確認・調整:

1. **Node.js Version**: `18.x`（最新LTSを推奨）
2. **Install Command**: `npm install`（デフォルト）
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Root Directory**: `frontend`

**package.jsonのエンジン指定**（推奨）:

`frontend/package.json`に追加:
```json
{
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

**成果物**:
- ✅ ビルド設定が最適化済み
- ✅ Node.jsバージョンが固定済み

---

### タスクV3.3: プレビューデプロイのテスト

**作業内容**:

```bash
# 新しいブランチを作成
git checkout -b test/vercel-preview

# 軽微な変更（例: README更新）
echo "# Vercel Preview Test" >> frontend/README.md
git add .
git commit -m "test: Vercel preview deployment"
git push origin test/vercel-preview
```

**GitHubでPull Request作成**:
1. GitHub > Pull Requests > New Pull Request
2. `test/vercel-preview` → `main`
3. Create Pull Request

**Vercelの自動デプロイ確認**:
- PR内にVercelのコメントが自動投稿される
- Preview URLが生成される（`https://mosaku-xxx-yyy.vercel.app`）
- Preview URLにアクセスして動作確認

**成果物**:
- ✅ プレビューデプロイが自動実行される
- ✅ PR単位でプレビューURLが生成される

---

## ⚙️ Phase V4: 環境変数設定・本番デプロイ（0.5日）

### タスクV4.1: 環境変数の設定

**Vercel Dashboard > Project Settings > Environment Variables**で設定:

**ステップ1: Supabase関連**
```
変数名: VITE_SUPABASE_URL
値: https://pxrouvdpdffdfoitmoyv.supabase.co
環境: Production, Preview, Development

変数名: VITE_SUPABASE_ANON_KEY
値: eyJhbGci... (実際の値)
環境: Production, Preview, Development
```

**ステップ2: バックエンドURL**
```
変数名: VITE_BACKEND_URL
値（Production）: https://[YOUR-SERVICE].a.run.app  ← Cloud Runデプロイ後
値（Preview）: http://localhost:3000  ← まだローカル
値（Development）: http://localhost:3000

環境: 各々個別に設定
```

**ステップ3: フロントエンドURL**
```
変数名: VITE_APP_URL
値（Production）: https://[YOUR-APP].vercel.app
値（Preview）: https://[YOUR-APP]-git-[BRANCH].vercel.app (ワイルドカード)
値（Development）: http://localhost:5173

環境: 各々個別に設定
```

**ステップ4: OAuth Client IDs（後で設定可）**
```
変数名: VITE_GOOGLE_CLIENT_ID
値: [本番用Client ID]
環境: Production

変数名: VITE_GITHUB_CLIENT_ID
値: [本番用Client ID]
環境: Production

変数名: VITE_X_CONSUMER_KEY
値: [本番用Consumer Key]
環境: Production
```

**設定後、再デプロイ**:
- Vercel Dashboard > Deployments > Latest > ⋯ > Redeploy

**成果物**:
- ✅ すべての環境変数が設定済み
- ✅ 環境別の値が正しく設定済み

---

### タスクV4.2: 本番デプロイの実行

**作業内容**:

```bash
# mainブランチにマージ（テストPRがある場合）
git checkout main
git merge test/vercel-preview
git push origin main

# または、直接mainブランチで作業
git checkout main
git add .
git commit -m "chore: configure Vercel deployment"
git push origin main
```

**Vercelの自動デプロイ確認**:
1. Vercel Dashboard > Deployments
2. 最新のデプロイを確認
3. ビルドログを確認
4. Production URLにアクセス

**本番URL**:
- `https://[YOUR-APP].vercel.app`

**成果物**:
- ✅ 本番環境にデプロイ済み
- ✅ Production URLでアクセス可能

---

### タスクV4.3: バックエンド接続の確認

**現時点での状態**:
- フロントエンドはVercelにデプロイ済み
- バックエンドはまだローカルまたはCloud Run未デプロイ

**一時的な対処（バックエンドがローカルの場合）**:

**オプション1: ngrokでローカルバックエンドを公開**（テスト用）
```bash
# ngrokインストール（まだの場合）
brew install ngrok  # macOS
# または https://ngrok.com/download

# バックエンドを起動
cd backend
npm run start:dev

# ngrokでポート3000を公開
ngrok http 3000

# 表示されたURL（https://xxxx.ngrok.io）をコピー
```

**Vercelの環境変数を更新**:
```
VITE_BACKEND_URL (Preview/Development)
値: https://xxxx.ngrok.io
```

**オプション2: バックエンドもすぐにCloud Runにデプロイ**
- `DEPLOYMENT_GUIDE.md`を参照してCloud Runにデプロイ
- デプロイ後のURLを`VITE_BACKEND_URL`に設定

**成果物**:
- ✅ フロントエンドがバックエンドに接続可能
- ✅ 基本的なAPI呼び出しが動作

---

## ✅ Phase V5: 動作確認・最適化（0.5日）

### タスクV5.1: E2Eテスト（本番環境）

**テスト項目**:

**基本動作**:
- [ ] トップページが表示される
- [ ] ログインページにアクセスできる
- [ ] ルーティングが正常（/memo, /notebooks, /tags）
- [ ] 静的アセット（画像、CSS）が読み込まれる
- [ ] テーマCSSが読み込まれる

**API接続**（バックエンド接続後）:
- [ ] ログインできる
- [ ] メモ一覧が表示される
- [ ] メモ作成・編集・削除ができる
- [ ] ノートブック操作ができる
- [ ] タグ操作ができる

**PWA機能**:
- [ ] Service Workerが登録される
- [ ] オフライン対応が動作する
- [ ] ホーム画面に追加できる（モバイル）

**パフォーマンス**:
- [ ] 初回読み込みが3秒以内
- [ ] ページ遷移がスムーズ
- [ ] Lighthouse スコアが良好（後述）

**成果物**:
- ✅ すべてのテスト項目がパス

---

### タスクV5.2: パフォーマンス最適化

**Lighthouse監査の実施**:

1. **Chrome DevTools > Lighthouse**
   - URL: `https://[YOUR-APP].vercel.app`
   - Mode: Navigation
   - Categories: Performance, Accessibility, Best Practices, SEO, PWA
   - Run

2. **目標スコア**:
   - Performance: 90+
   - Accessibility: 90+
   - Best Practices: 90+
   - SEO: 90+
   - PWA: インストール可能

**改善が必要な場合**:

**画像最適化**:
```bash
# 画像圧縮（必要に応じて）
npm install -D vite-plugin-imagemin

# vite.config.ts に追加
import viteImagemin from 'vite-plugin-imagemin';

plugins: [
  // ...
  viteImagemin({
    gifsicle: { optimizationLevel: 7 },
    optipng: { optimizationLevel: 7 },
    mozjpeg: { quality: 80 },
    pngquant: { quality: [0.8, 0.9] },
    svgo: { plugins: [{ name: 'removeViewBox' }] },
  }),
]
```

**コード分割の確認**:
```typescript
// 既にReact.lazyを使用しているか確認
// 使用していない場合は追加

import { lazy, Suspense } from 'react';

const MemoPage = lazy(() => import('./pages/MemoPage'));

// ルーティング
<Suspense fallback={<div>Loading...</div>}>
  <MemoPage />
</Suspense>
```

**ビルドサイズの確認**:
```bash
cd frontend
npm run build

# バンドルサイズを可視化
npx vite-bundle-visualizer
```

**成果物**:
- ✅ Lighthouseスコアが目標達成
- ✅ バンドルサイズが最適化

---

### タスクV5.3: エラー監視の設定（オプション）

**Sentryの統合**（推奨）:

```bash
cd frontend
npm install @sentry/react @sentry/vite-plugin
```

**vite.config.ts更新**:
```typescript
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    // ...
    sentryVitePlugin({
      org: 'your-org',
      project: 'mosaku-frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  build: {
    sourcemap: true, // Sentryのスタックトレース用
  },
});
```

**main.tsxに初期化コード追加**:
```typescript
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

**Vercel環境変数に追加**:
```
変数名: VITE_SENTRY_DSN
値: https://xxx@xxx.ingest.sentry.io/xxx
環境: Production, Preview
```

**成果物**:
- ✅ エラー監視が設定済み（オプション）

---

## 🌐 Phase V6: カスタムドメイン・CI/CD（オプション、0.5-1日）

### タスクV6.1: カスタムドメインの設定（オプション）

**前提条件**:
- カスタムドメインを所有している（例: `mosaku.example.com`）

**作業内容**:

1. **Vercel Dashboardでドメイン追加**
   - Project Settings > Domains
   - 「Add」をクリック
   - ドメイン名を入力（例: `mosaku.example.com`）

2. **DNS設定**
   - ドメインプロバイダー（お名前.com、Route53など）で設定
   - Vercelが指示するレコードを追加：
     ```
     Type: CNAME
     Name: mosaku (または @)
     Value: cname.vercel-dns.com
     ```

3. **SSL証明書の自動発行**
   - Vercelが自動的にLet's Encrypt証明書を発行
   - 数分〜数時間で有効化

4. **動作確認**
   - `https://mosaku.example.com`にアクセス
   - SSL証明書が有効か確認

**環境変数の更新**:
```
VITE_APP_URL (Production)
値: https://mosaku.example.com
```

**成果物**:
- ✅ カスタムドメインが設定済み
- ✅ HTTPS接続が有効

---

### タスクV6.2: デプロイフックの設定

**Vercel Dashboard > Project Settings > Git**:

**ブランチ保護の設定**:
```
Production Branch: main
Preview Branches: すべてのブランチ
Ignored Build Step: なし
```

**ビルドコマンドの環境変数による制御**（高度な設定）:

`vercel.json`に追加:
```json
{
  "github": {
    "silent": true,
    "autoJobCancelation": true
  }
}
```

**成果物**:
- ✅ デプロイフローが最適化済み

---

### タスクV6.3: GitHub Actionsとの統合（オプション）

**E2Eテスト自動化**:

新規ファイル作成: `.github/workflows/e2e-test.yml`

```yaml
name: E2E Tests on Vercel Preview

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Wait for Vercel Preview
        uses: patrickedqvist/wait-for-vercel-preview@v1.3.1
        id: vercel-preview
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          max_timeout: 300

      - name: Run E2E Tests
        run: |
          cd frontend
          npm install
          npm run test:e2e -- --url ${{ steps.vercel-preview.outputs.url }}
```

**成果物**:
- ✅ PR作成時に自動E2Eテスト（オプション）

---

## 📊 Phase V完了チェックリスト

### Phase V1: 準備
- [ ] Vercelアカウント作成済み
- [ ] Vercel CLIインストール済み
- [ ] vercel.json作成済み
- [ ] .vercelignore作成済み

### Phase V2: ビルド検証
- [ ] ローカルビルド成功
- [ ] ローカルプレビュー正常動作
- [ ] 環境変数整理済み

### Phase V3: 初回デプロイ
- [ ] Vercelプロジェクト作成済み
- [ ] 初回デプロイ成功
- [ ] プレビューデプロイ動作確認

### Phase V4: 環境変数・本番デプロイ
- [ ] 環境変数設定済み
- [ ] 本番デプロイ成功
- [ ] バックエンド接続確認

### Phase V5: 動作確認・最適化
- [ ] E2Eテスト完了
- [ ] Lighthouseスコア良好
- [ ] エラー監視設定済み（オプション）

### Phase V6: カスタムドメイン・CI/CD（オプション）
- [ ] カスタムドメイン設定済み
- [ ] デプロイフック最適化済み
- [ ] GitHub Actions統合済み（オプション）

---

## 🔄 デプロイ後の運用

### 定期的なタスク

**毎週**:
- [ ] Lighthouseスコア確認
- [ ] エラー監視ダッシュボード確認
- [ ] 依存関係の更新確認

**毎月**:
- [ ] Vercel Analytics確認
- [ ] パフォーマンス最適化

**デプロイ時**:
- [ ] プレビューURLで動作確認
- [ ] Lighthouse監査実施
- [ ] 本番環境でスモークテスト

---

## 🛡️ トラブルシューティング

### ビルドエラー

**問題**: ビルドが失敗する

**解決策**:
```bash
# ローカルでビルドを確認
cd frontend
npm run build

# エラーログを確認
# TypeScriptエラーを修正
# 依存関係の問題を解決
```

### 環境変数が反映されない

**問題**: 環境変数が読み込まれない

**解決策**:
1. Vercel Dashboard > Environment Variablesで正しく設定されているか確認
2. 環境（Production/Preview/Development）が正しいか確認
3. 再デプロイを実行（設定変更後は必須）
4. `VITE_`プレフィックスがあるか確認（Viteの要件）

### CORS エラー

**問題**: バックエンドへのAPIリクエストでCORSエラー

**解決策**:
1. バックエンドの`CORS_ORIGINS`にVercel URLを追加
   ```
   CORS_ORIGINS=https://[YOUR-APP].vercel.app,https://[YOUR-APP]-*.vercel.app
   ```
2. バックエンドを再デプロイ

### ルーティングが404

**問題**: SPAルーティングが404エラー

**解決策**:
- `vercel.json`の`rewrites`設定を確認
- すべてのパスが`/index.html`にリダイレクトされるか確認

---

## 📝 次のアクション

Vercelデプロイを開始しますか？

準備ができたら「Phase V1を開始します」と伝えてください。

また、全体の移行順序を調整した統合計画も作成しました。
詳細は次のドキュメントを参照してください。
