# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

アーキテクチャ・技術スタック・ディレクトリ構成の詳細は `.kiro/steering/` を参照してください。

## 開発コマンド

### モノレポコマンド（ルートから実行）

```bash
npm install          # 全依存関係をインストール
npm run dev          # フロントエンド・バックエンドを同時起動
npm run build        # 両プロジェクトをビルド
npm run lint         # 全コードをリント
npm run format       # 全コードをフォーマット
npm run format:check # フォーマットチェック（CIと同等）
npm run setup-hooks  # Git フック（pre-commit / pre-push）をインストール
```

### Docker 環境

```bash
docker-compose up          # 全サービスを起動（backend:3000、frontend:5173、nginx:80）
docker-compose down        # 全サービスを停止
docker-compose up --build  # リビルドして再起動
```

### バックエンド（NestJS）

```bash
cd backend
npm run start:dev     # ホットリロード付き開発サーバー
npm run test          # 全ユニットテスト
npm run test -- --testPathPattern=memo.service  # 単一ファイルのテスト
npm run test:e2e      # E2E テスト
npm run test:cov      # カバレッジレポート
npx prisma migrate dev    # マイグレーション作成・適用
npx prisma migrate deploy # マイグレーション適用（本番）
npx prisma generate       # Prisma クライアント生成（スキーマ変更後に必須）
npx prisma studio         # Prisma Studio GUI
```

### フロントエンド（React + Vite）

```bash
cd frontend
npm run dev       # ポート 5173 で開発サーバー起動
npm run build     # TypeScript チェック + Vite ビルド
npm run preview   # 本番ビルドをプレビュー
npm run test      # Vitest で全テスト実行
npm run test -- src/hooks/useAutoSave.test.ts  # 単一ファイルのテスト
npm run test:e2e  # Playwright E2E テスト
```

## デプロイアーキテクチャ

| 環境     | フロントエンド | バックエンド     | データベース        |
| -------- | -------------- | ---------------- | ------------------- |
| ローカル | Vite（5173）   | NestJS（3000）   | Docker PostgreSQL   |
| 本番     | Vercel         | Google Cloud Run | Supabase PostgreSQL |

本番デプロイ手順は [docs/deployment/](./docs/deployment/) を参照してください。

### 環境変数

**バックエンド:**

- `DATABASE_URL` - Supabase コネクションプーリング（ポート 6543）
- `DIRECT_URL` - Supabase 直接接続（マイグレーション用、ポート 5432）
- `JWT_SECRET` - JWT 署名キー
- `CORS_ORIGINS` - 許可オリジンのカンマ区切りリスト
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`、`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `SENTRY_DSN` - Sentry プロジェクトの DSN（未設定時は SDK 起動スキップ）
- `SENTRY_ENVIRONMENT` - `production` / `development`。未指定時は `NODE_ENV` から推定
- `SENTRY_RELEASE` - リリース識別子（CI から `${{ github.sha }}` を注入）
- `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE` - 既定は本番 `0.1` / development `0`

**フロントエンド（`VITE_` プレフィックス必須）:**

- `VITE_BACKEND_URL` - バックエンド API の URL
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID` / `VITE_GITHUB_CLIENT_ID`
- `VITE_SENTRY_DSN` - Frontend Sentry プロジェクトの DSN
- `VITE_SENTRY_ENVIRONMENT` - `production` / `development`（未指定時は `production`）
- `VITE_SENTRY_RELEASE` - CI から `${{ github.sha }}` を注入（Vercel Env には登録不要）
- `VITE_SENTRY_TRACES_SAMPLE_RATE` - 既定は本番 `0.1` / development `0`

**CI（GitHub Secrets）:**

- `SENTRY_AUTH_TOKEN` - `@sentry/cli` / `@sentry/vite-plugin` のリリース登録 + source map upload 用（scope は `project:releases` のみ）
- `SENTRY_ORG` - Sentry organization slug
- `SENTRY_PROJECT_BACKEND` / `SENTRY_PROJECT_FRONTEND` - プロジェクト slug

> Sentry 運用の詳細は [`docs/deployment/sentry.md`](./docs/deployment/sentry.md) を参照。

## Git フック

`npm run setup-hooks` で以下のフックがインストールされる:

- **pre-commit**: ステージ済みファイルを Prettier で自動フォーマットし再ステージ
- **pre-push**: `prisma generate` → ESLint → TypeScript 型チェック（frontend）を実行。いずれかが失敗すると push がブロックされる

## よくある落とし穴

1. **Prisma クライアントが見つからない**: スキーマ変更後に `npx prisma generate` を実行（生成先は `node_modules/@prisma/client`）
2. **CORS エラー**: `CORS_ORIGINS` にフロントエンドの URL が含まれているか確認
3. **OAuth リダイレクト不一致**: コールバック URL が `{BACKEND_URL}/auth/{provider}/callback` に一致しているか確認
4. **マイグレーション競合**: 新しいマイグレーションを作成する前に最新のマイグレーションをプル
5. **Docker ポート競合**: ポート 80、3000、5173 が使用可能か確認
6. **Supabase 接続**: `DATABASE_URL` はプーリング（6543）、`DIRECT_URL` は直接接続（5432）を使い分けること

## 仕様駆動開発（cc-sdd）

本プロジェクトでは **cc-sdd** による仕様駆動開発を採用しています。
**全ての機能追加・修正は仕様定義 → 承認 → 実装の順で進めること。承認なしに実装しない。**

### ワークフロー

```
/kiro:spec-init "機能の説明"
  ↓
/kiro:spec-requirements → 人間が承認
  ↓
/kiro:spec-design → 人間が承認
  ↓
/kiro:spec-tasks → 人間が承認
  ↓
/kiro:spec-impl（タスク番号）→ TDD（RED → GREEN → REFACTOR）
  ↓
/kiro:validate-impl で整合性確認
  ↓
コミット（1 Todo = 1 Commit）
```

### ディレクトリ構成

```
.kiro/
├── steering/        # プロジェクト記憶（product.md / tech.md / structure.md）
└── specs/           # 機能ごとの仕様書（spec-init で生成）
    └── {機能名}/
        ├── requirements.md
        ├── design.md
        ├── tasks.md
        └── spec.json  # フェーズ進捗管理
```

### Steering の更新

コードに大きな変更があった場合は `/kiro:steering` を実行して steering ファイルを同期してください。

## ドキュメント

- **[プロジェクト計画](./docs/project-plan-2026.md)** - 2026年ロードマップ・マイルストーン
- **[デプロイガイド](./docs/deployment/)** - Cloud Run・Vercel のデプロイ手順
- **[開発ドキュメント](./docs/development/)** - 開発関連のドキュメント
