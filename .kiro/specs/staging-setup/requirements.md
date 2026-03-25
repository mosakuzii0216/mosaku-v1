# Requirements Document

## Introduction

本番リリース（Phase 0）前に、本番と同等構成の Staging 環境を構築する。バックエンド（Cloud Run）・フロントエンド（Vercel）・データベース（Supabase）をそれぞれ Staging 専用インスタンスとして用意し、シークレット管理・ドメイン・マイグレーション実行フローを整備することで、本番デプロイ前の最終検証を安全に行えるようにする。

## Requirements

### Requirement 1: Supabase Staging プロジェクトの構築

**Objective:** As a 開発者, I want Staging 専用の Supabase プロジェクトを持つこと, so that 本番 DB を汚染せずに Staging 動作確認とマイグレーション検証ができる。

#### Acceptance Criteria

1. The Staging 環境 shall Supabase の独立したプロジェクトを使用し、本番プロジェクトとは完全に分離されていること。
2. The Staging 環境 shall `DATABASE_URL`（コネクションプーリング、ポート 6543）と `DIRECT_URL`（直接接続、ポート 5432）の2つの接続文字列を保持すること。
3. When `npx prisma migrate deploy` を Staging DB に対して実行したとき, the Staging 環境 shall 全マイグレーションが順番に適用されること。
4. If マイグレーションが失敗したとき, the Staging 環境 shall エラーメッセージが出力されてデプロイが中断されること。

---

### Requirement 2: Cloud Run Staging サービスの構築

**Objective:** As a 開発者, I want Staging 専用の Cloud Run サービスでバックエンドを動かすこと, so that 本番と同等の実行環境で API 動作を確認できる。

#### Acceptance Criteria

1. The Staging バックエンド shall 本番サービスとは別の Cloud Run サービス（例: `mosaku-backend-staging`）として構築されること。
2. The Staging バックエンド shall Staging 用の環境変数（`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, OAuth クライアント ID/Secret 等）を保持すること。
3. When Staging サービスへリクエストを送ったとき, the Staging バックエンド shall 200 系レスポンスを返し、本番サービスに影響を与えないこと。
4. The Staging バックエンド shall `CORS_ORIGINS` に Staging フロントエンドの URL が含まれており、CORS エラーが発生しないこと。
5. Where Cloud Run の Secret Manager を使用する場合, the Staging バックエンド shall シークレットが Secret Manager から注入され、ソースコードや Dockerfile に平文で含まれないこと。

---

### Requirement 3: Vercel Staging デプロイの構築

**Objective:** As a 開発者, I want Staging 専用の Vercel 環境でフロントエンドを動かすこと, so that Staging バックエンドに向けた UI 動作を本番とは独立して確認できる。

#### Acceptance Criteria

1. The Staging フロントエンド shall Vercel の Preview 環境または専用の Staging ブランチデプロイとして構成されること。
2. The Staging フロントエンド shall `VITE_BACKEND_URL` が Staging Cloud Run サービスの URL を指すこと。
3. The Staging フロントエンド shall `VITE_SUPABASE_URL` および `VITE_SUPABASE_ANON_KEY` が Staging Supabase プロジェクトのものを指すこと。
4. When Staging フロントエンドにアクセスしたとき, the Staging フロントエンド shall Staging バックエンドと正常に通信できること。

---

### Requirement 4: シークレット管理

**Objective:** As a 開発者, I want Staging の認証情報をセキュアに管理すること, so that シークレットが漏洩するリスクなく Staging 環境を運用できる。

#### Acceptance Criteria

1. The Staging 環境 shall Staging 用のシークレット（JWT_SECRET、DB 接続文字列、OAuth クライアント情報）を本番と別の値で管理すること。
2. The Staging 環境 shall シークレットをリポジトリにコミットしないこと（`.gitignore` または Secret Manager による管理）。
3. When CI/CD パイプラインまたは手動デプロイを実行したとき, the デプロイシステム shall シークレットを環境変数として Cloud Run に注入できること。
4. The Staging 環境 shall OAuth コールバック URL（`{STAGING_BACKEND_URL}/auth/google/callback` 等）が Google Cloud Console および GitHub OAuth App に登録されていること。

---

### Requirement 5: ドメインと URL の設定

**Objective:** As a 開発者, I want Staging 環境に固定 URL を割り当てること, so that チーム内での動作確認や共有が容易にできる。

#### Acceptance Criteria

1. The Staging バックエンド shall Cloud Run が発行するデフォルト URL（`*.run.app`）または `staging-api.mosaku.app` 等のカスタムドメインを持つこと。
2. The Staging フロントエンド shall Vercel が発行するデフォルト URL（`*.vercel.app`）または `staging.mosaku.app` 等のカスタムドメインを持つこと。
3. When HTTPS で Staging URL にアクセスしたとき, the Staging 環境 shall 有効な SSL 証明書でレスポンスを返すこと。

---

### Requirement 6: マイグレーション実行フロー

**Objective:** As a 開発者, I want Staging DB へのマイグレーション手順が文書化されていること, so that 新しいマイグレーションを本番に反映する前に Staging で安全に検証できる。

#### Acceptance Criteria

1. The デプロイフロー shall `npx prisma migrate deploy` を Staging の `DIRECT_URL` に対して実行するコマンドまたはスクリプトが存在すること。
2. When Staging にデプロイするとき, the デプロイフロー shall マイグレーション適用 → アプリ起動 の順序で実行されること。
3. The デプロイフロー shall マイグレーション後に `npx prisma generate` を実行して Prisma クライアントを再生成すること（スキーマ変更時）。
4. If Staging マイグレーションが成功したとき, the 開発者 shall 本番への同一マイグレーション適用の準備が整ったと判断できること。
