# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

アーキテクチャ・技術スタック・ディレクトリ構成の詳細は `.kiro/steering/` を参照してください。

## アーキテクチャの不変則（重要）

- **サーバー状態の真実の源泉は React Query**。Zustand へのデータコピー禁止
- **API コールは `apiClient` 経由**（`utils/api.ts`）。直接 `fetch` 禁止
- **所有権チェックは `AuthorizationService.validateOwnership()` で一元化**
- **認証はグローバル JWT Guard + `@Public()` オプトアウト**
- **テーマは CSS ファイル管理**（`frontend/public/themes/{category}/{name}.css`）。DB にはメタデータのみ
- **ゴミ箱は Soft Delete + cron 物理削除**（`trashedAt` カラム + 30日後削除）
- **Sentry 初期化は `main.ts` の最初の import**（`import './instrument'`）

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
npm run test -- --testPathPattern=memo.service       # 単一ファイルのテスト
npm run test -- --testNamePattern="should create"    # 特定テストケースのみ
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
npm run test -- --watch                         # ウォッチモード
npm run test:e2e  # Playwright E2E テスト
```

## デプロイアーキテクチャ

| 環境     | フロントエンド | バックエンド     | データベース        |
| -------- | -------------- | ---------------- | ------------------- |
| ローカル | Vite（5173）   | NestJS（3000）   | Docker PostgreSQL   |
| 本番     | Vercel         | Google Cloud Run | Supabase PostgreSQL |

本番デプロイ手順は [docs/deployment/](./docs/deployment/) を参照してください。

### 環境変数

完全リストは `.env.example` を参照。要点のみ:

- **DB**: `DATABASE_URL`（6543/プーリング）/ `DIRECT_URL`（5432/マイグレーション用）
- **Auth**: `JWT_SECRET`, `{GOOGLE,X,APPLE}_CLIENT_*`
- **CORS**: `CORS_ORIGINS`（カンマ区切り）
- **Sentry**: `SENTRY_*` / `VITE_SENTRY_*` — 詳細は [`docs/deployment/sentry.md`](./docs/deployment/sentry.md)
- **Frontend**: 全て `VITE_` プレフィックス必須

## Git フック

`npm run setup-hooks` で以下のフックがインストールされる:

- **pre-commit**: ステージ済みファイルを Prettier で自動フォーマットし再ステージ
- **pre-push**: `prisma generate` → ESLint → TypeScript 型チェック（frontend）を実行。いずれかが失敗すると push がブロックされる

## コミット規約

Conventional Commits + scope を使用。例: `feat(frontend/memo): メモ一覧にソート機能を追加`

スコープは `{layer}/{domain}` 形式（例: `backend/auth`, `frontend/memo`）。

## よくある落とし穴

1. **Prisma クライアントが見つからない**: スキーマ変更後に `npx prisma generate` を実行（生成先は `node_modules/@prisma/client`）
2. **CORS エラー**: `CORS_ORIGINS` にフロントエンドの URL が含まれているか確認
3. **OAuth リダイレクト不一致**: コールバック URL が `{BACKEND_URL}/auth/{provider}/callback` に一致しているか確認
4. **マイグレーション競合**: 新しいマイグレーションを作成する前に最新のマイグレーションをプル
5. **Docker ポート競合**: ポート 80、3000、5173 が使用可能か確認
6. **Supabase 接続**: `DATABASE_URL` はプーリング（6543）、`DIRECT_URL` は直接接続（5432）を使い分けること
7. **OAuth Strategy 未設定時の挙動**: Client ID/Secret が空の場合は警告ログを出して起動継続。新規プロバイダ追加時も同様に対応すること
8. **テーマエフェクトの自動停止**: `prefers-reduced-motion` / エディタフォーカス / タブ非表示 / マウス3秒アイドル で停止する設計。新エフェクト追加時もこの条件を尊重すること
9. **`npm run dev` は dev サーバーを取り残しうる**: 定義が `backend start:dev & frontend dev` で backend を `&` で裏に回しているため、Ctrl+C は前面の frontend にしか届かず backend が残る。次回起動時に「ポート使用中」で失敗したら `lsof -nP -iTCP:3000 -iTCP:5173 -sTCP:LISTEN` で確認して kill する。**`-sTCP:LISTEN` は必須** — 省略すると当該ポートに接続中のクライアント（ブラウザ等）まで拾ってしまう。バックグラウンドで起動する場合は `npm run dev` を経由せず backend / frontend を個別に投げること

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
├── steering/        # プロジェクト記憶（product.md / tech.md / structure.md / dogfooding.md / quality.md）
└── specs/           # 機能ごとの仕様書（spec-init で生成）
    └── {機能名}/
        ├── requirements.md
        ├── design.md
        ├── tasks.md
        └── spec.json  # フェーズ進捗管理
```

### 進行中の仕様

現在のアクティブな仕様は `.kiro/specs/` 配下を参照。各 `spec.json` の `phase` で進捗確認可。

### Steering の更新

コードに大きな変更があった場合は `/kiro:steering` を実行して steering ファイルを同期してください。

## ドッグフーディング（Phase 1）

Friction Log ノートブックに摩擦を記録（1 メモ = 1 摩擦）→ 毎週金曜トリアージで `#blocker` / `#major` / `#minor` をタグ付け → `#blocker` / `#major` を `/kiro:spec-init` で起票。

詳細運用は `.kiro/steering/dogfooding.md` を参照。

## ドキュメント

- **[プロジェクト計画](./docs/project-plan-2026.md)** - 2026年ロードマップ・マイルストーン
- **[デプロイガイド](./docs/deployment/)** - Cloud Run・Vercel のデプロイ手順
- **[開発ドキュメント](./docs/development/)** - 開発関連のドキュメント
