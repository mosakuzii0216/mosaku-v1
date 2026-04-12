## 環境構築手順

### 1. 環境変数の設定

`.env.example`をコピーして`.env`ファイルを作成：

```bash
cp .env.example .env
```


### 2. Google OAuth設定

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成（または既存プロジェクトを選択）
3. 以下のAPIを有効化：
   - Google+ API
   - People API
4. 認証情報の作成：
   - 「認証情報」→「認証情報を作成」→「OAuth 2.0 クライアント ID」
   - アプリケーションの種類：「ウェブアプリケーション」
   - 承認済みのリダイレクト URI：`http://localhost/api/auth/google/callback`
5. `.env`ファイルに以下を設定：
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

### 3. アプリケーションの起動

```bash
# Docker Composeで全サービスを起動
docker-compose up -d

# アプリケーションにアクセス
open http://localhost
```

### 4. 初期設定

管理者ユーザーとして登録するには、`.env`ファイルの`ADMIN_EMAIL`に設定したメールアドレスでユーザー登録してください。



## 開発

### バックエンド開発

```bash
cd backend
npm install
npm run start:dev
```

### フロントエンド開発

```bash
cd frontend
npm install
npm run dev
```

### データベース操作

```bash
cd backend
npx prisma studio          # Prisma Studio起動
npx prisma migrate dev      # マイグレーション実行
npx prisma generate         # Prismaクライアント生成
```


## ドキュメント

- **[デプロイ手順](./docs/deployment/)** - Cloud Run / Vercel へのデプロイ
- **[開発ガイド](./docs/development/)** - 開発関連のドキュメント
- **[CLAUDE.md](./CLAUDE.md)** - Claude Code向けのプロジェクト説明書
