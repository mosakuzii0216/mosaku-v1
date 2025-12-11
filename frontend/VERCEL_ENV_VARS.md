# Vercel環境変数設定リスト

以下の環境変数をVercel Dashboard > Project Settings > Environment Variablesで設定してください。

## 必須環境変数

| 変数名 | 値 | 環境 | 説明 |
|--------|-----|------|------|
| `VITE_SUPABASE_URL` | `https://ninyjmahwnbtgqqjxcli.supabase.co` | Production, Preview, Development | Supabase プロジェクトURL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` (実際の値は.envから) | Production, Preview, Development | Supabase 匿名キー |
| `VITE_BACKEND_URL` | 下記参照 | 環境別に設定 | バックエンドAPI URL |
| `VITE_APP_URL` | 下記参照 | 環境別に設定 | フロントエンドURL |

### `VITE_BACKEND_URL` の設定

- **Production**: `https://[YOUR-SERVICE].a.run.app` (Cloud Runデプロイ後に設定)
- **Preview**: `http://localhost:3000` または ngrok URL
- **Development**: `http://localhost:3000`

### `VITE_APP_URL` の設定

- **Production**: `https://[YOUR-APP].vercel.app`
- **Preview**: Vercel自動生成URL (`https://[YOUR-APP]-git-[BRANCH].vercel.app`)
- **Development**: `http://localhost:5173`

## OAuth関連（本番環境用）

| 変数名 | 値 | 環境 | 説明 |
|--------|-----|------|------|
| `VITE_GOOGLE_CLIENT_ID` | 本番用Client ID | Production | Google OAuth Client ID |
| `VITE_GITHUB_CLIENT_ID` | 本番用Client ID | Production | GitHub OAuth Client ID |
| `VITE_X_CONSUMER_KEY` | 本番用Consumer Key | Production | X (Twitter) OAuth Consumer Key |

**注意**: OAuth設定には、各プロバイダーのコンソールでリダイレクトURLを更新する必要があります:
- Google: `https://[BACKEND-URL]/auth/google/callback`
- GitHub: `https://[BACKEND-URL]/auth/github/callback`
- X: `https://[BACKEND-URL]/auth/x/callback`

## 設定方法

1. [Vercel Dashboard](https://vercel.com/dashboard) にアクセス
2. プロジェクトを選択 > Settings > Environment Variables
3. 上記の変数を1つずつ追加
4. 各変数ごとに対象環境（Production/Preview/Development）を選択
5. Saveをクリック

## 環境変数の確認

設定後、Vercel Dashboardで以下を確認:
- ✅ すべての必須変数が設定されている
- ✅ 環境ごとに正しい値が設定されている
- ✅ `VITE_` プレフィックスが付いている (Viteの要件)

## トラブルシューティング

### 環境変数が反映されない場合

1. 変数名に `VITE_` プレフィックスがあるか確認
2. Vercel Dashboardで正しい環境に設定されているか確認
3. 環境変数を追加/変更した後は**再デプロイが必要**です:
   - Deployments > Latest > ⋯ > Redeploy

### CORS エラーが発生する場合

バックエンドの `CORS_ORIGINS` にVercel URLを追加:
```
CORS_ORIGINS=https://[YOUR-APP].vercel.app,https://[YOUR-APP]-*.vercel.app
```
