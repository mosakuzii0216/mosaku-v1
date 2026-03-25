# Implementation Plan

## Tasks

- [ ] 1. Supabase Staging プロジェクトを作成して接続文字列を取得する
- [ ] 1.1 Supabase コンソールで Staging 専用プロジェクトを作成する
  - Supabase コンソールにログインし、本番プロジェクトとは別に Staging 用プロジェクトを新規作成する
  - プロジェクト名は `mosaku-staging` 等の分かりやすい名前にする
  - リージョンは本番と同一（ap-northeast-1 等）を選択する
  - _Requirements: 1.1_

- [ ] 1.2 Staging DB の接続文字列を取得して記録する
  - Supabase コンソールの Settings > Database から接続情報を取得する
  - コネクションプーリング URL（ポート 6543）を `DATABASE_URL` として記録する
  - 直接接続 URL（ポート 5432）を `DIRECT_URL` として記録する
  - ローカルの `.env.staging`（`.gitignore` 対象）に一時保存し、次のタスクで Secret Manager に移行する
  - _Requirements: 1.2_

- [ ] 2. GCP Secret Manager に Staging シークレットを登録する
- [ ] 2.1 Staging DB 接続文字列を Secret Manager に登録する
  - `gcloud secrets create database-url-staging` と `direct-url-staging` を作成する
  - タスク 1.2 で取得した接続文字列を各シークレットの初期バージョンとして登録する
  - Cloud Run サービスアカウントに `roles/secretmanager.secretAccessor` ロールを付与する
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 2.2 (P) 認証系シークレットを Secret Manager に登録する
  - `jwt-secret-staging` に本番とは異なる JWT シークレット値を生成・登録する（`openssl rand -base64 32` 等で生成）
  - Staging 用 Google OAuth アプリのクライアント ID / Secret を `google-client-id-staging` / `google-client-secret-staging` として登録する
  - Staging 用 GitHub OAuth アプリのクライアント ID / Secret を `github-client-id-staging` / `github-client-secret-staging` として登録する
  - タスク 2.1 と並列実行可能（扱うシークレットが独立しており共有リソースの競合なし）
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 3. (P) Staging 用マイグレーションスクリプトを作成する
  - `scripts/migrate-staging.sh` を作成し、Staging `DIRECT_URL` を指定して `prisma migrate deploy && npx prisma generate` を実行するコマンドを記述する
  - スクリプトに実行権限を付与する（`chmod +x`）
  - `.env.staging` を `.gitignore` に追加してシークレットをリポジトリから除外する
  - タスク 2 と並列実行可能（スクリプトの作成はシークレット登録の完了を待たない）
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 4. Staging DB に初回マイグレーションを適用する
  - タスク 1（Supabase Staging プロジェクト）とタスク 3（マイグレーションスクリプト）の完了後に実行する
  - `.env.staging` に Staging `DIRECT_URL` を設定してタスク 3 で作成したスクリプトを実行する
  - `npx prisma migrate status` で全マイグレーションが "Applied" になっていることを確認する
  - 失敗した場合はエラーメッセージを確認し、マイグレーションファイルを修正して再実行する
  - _Requirements: 1.3, 1.4, 6.1, 6.2, 6.3, 6.4_

- [ ] 5. Cloud Run に mosaku-backend-staging サービスをデプロイする
  - タスク 2（Secret Manager 全シークレット登録）とタスク 4（マイグレーション適用）の完了後に実行する
  - `gcloud run deploy mosaku-backend-staging` で本番と同一 Docker イメージを使用してデプロイする
  - `--set-secrets` フラグで全 Staging シークレットを環境変数として注入する
  - `--set-env-vars CORS_ORIGINS=<staging_vercel_url>` で Staging フロントエンド URL を CORS 許可リストに設定する（Vercel URL が確定するまで仮 URL で設定し、タスク 6 完了後に更新する）
  - デプロイ後に発行される `*.run.app` URL を記録する（以降のタスクで使用）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.3, 5.1, 5.3_

- [ ] 6. Vercel Preview 環境に Staging 環境変数を設定して staging ブランチを作成する
- [ ] 6.1 staging ブランチを作成して Vercel に Push する
  - `git checkout -b staging` で staging ブランチを作成する
  - Vercel Dashboard の Git Integration でブランチトラッキングを確認し、`staging` ブランチが Preview 環境として認識されることを確認する
  - staging ブランチを remote に Push して Preview デプロイが起動することを確認する
  - _Requirements: 3.1, 5.2, 5.3_

- [ ] 6.2 Vercel Preview 環境変数に Staging 固有の値を設定する
  - Vercel Dashboard > Settings > Environment Variables で各変数の「Environment」を「Preview」に設定する
  - `VITE_BACKEND_URL` に タスク 5 で確認した Staging Cloud Run URL を設定する
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` に Staging Supabase プロジェクトの値を設定する
  - `VITE_GOOGLE_CLIENT_ID` / `VITE_GITHUB_CLIENT_ID` に Staging OAuth アプリのクライアント ID を設定する
  - 設定後に staging ブランチに空コミットを Push して Preview 再デプロイをトリガーし、Vercel Preview URL を確認する
  - _Requirements: 3.2, 3.3_

- [ ] 7. OAuth コールバック URL を Staging サービスに登録する
  - タスク 5（Cloud Run URL 確定）とタスク 6（Vercel Preview URL 確定）の完了後に実行する
  - Google Cloud Console の OAuth クライアント設定に `{STAGING_BACKEND_URL}/auth/google/callback` を追加する
  - GitHub OAuth App の設定に `{STAGING_BACKEND_URL}/auth/github/callback` を追加する
  - Cloud Run Staging サービスの `CORS_ORIGINS` を Vercel Preview URL（タスク 6.2 で確認した URL）に更新する
  - _Requirements: 4.4_

- [ ] 8. Staging 環境の統合動作確認を実施する
- [ ] 8.1 各コンポーネントの単体ヘルスチェックを実施する
  - `GET {STAGING_BACKEND_URL}/` または `/health` エンドポイントに curl でリクエストして 200 系レスポンスを確認する
  - Staging Vercel Preview URL にアクセスして画面が正常に表示されることを確認する
  - ブラウザの Network タブで `VITE_BACKEND_URL` が Staging Cloud Run URL を指しているリクエストを確認する
  - 本番 Cloud Run サービス（`mosaku-backend`）と本番 Vercel が影響を受けていないことを確認する
  - _Requirements: 2.3, 3.4, 5.1, 5.2, 5.3_

- [ ] 8.2 Staging 環境での認証とメモ操作の動作確認を実施する
  - Staging フロントエンドから Google / GitHub OAuth ログインが成功することを確認する
  - ログイン後にメモの作成・編集・削除（ゴミ箱移動）が Staging DB に正常に反映されることを確認する
  - ゴミ箱からの復元と完全削除が正常に動作することを確認する
  - 本番フロントエンドのメモデータに影響がないことを確認する
  - _Requirements: 2.3, 2.4, 3.4, 6.4_
