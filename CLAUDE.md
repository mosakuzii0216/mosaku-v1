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

## 仕様駆動開発（OpenSpec + Superpowers）

> **2026-08-12 に cc-sdd から移行。** 理由は `docs/development/sdd-framework-migration.md` を参照。
> 要約: cc-sdd（`gotalab/cc-sdd`）は 3.6k star・2026-05-20 を最後に更新停止。対して OpenSpec は 64k star、Superpowers は 271k star でいずれも活発。加えて cc-sdd には「まだ何を作るか決まっていない」段階の受け皿が無く、全変更に同じ重さの承認フローを強制する硬直性があった。

役割が重ならない 2 つを併用する。

| レイヤー             | ツール            | 担当                                                 |
| -------------------- | ----------------- | ---------------------------------------------------- |
| **仕様**             | **OpenSpec**      | 何を作るかの探索・提案・仕様の永続化                 |
| **実装規律**         | **Superpowers**   | TDD（真の RED/GREEN）・YAGNI・DRY・subagent 駆動実装 |
| **プロジェクト記憶** | `.kiro/steering/` | 継続。OpenSpec に相当機能が無いため維持する          |

### ワークフロー

```
/opsx:explore          # 何を作るか決まっていない段階の壁打ち（cc-sdd に無かった入口）
  ↓
/opsx:propose "説明"   # proposal.md / specs/ / design.md / tasks.md を生成 → 人間が承認
  ↓
/opsx:apply            # タスクを順に実装（Superpowers の TDD 規律が乗る）
  ↓
/opsx:archive          # 完了した変更を openspec/specs/ へ反映しアーカイブ
```

**実装前に人間の承認を挟む原則は維持する。** ただし「全ての変更に同じ重さのフローを課すか」は未決事項（`docs/development/sdd-framework-migration.md` の「未決」節を参照）。

### ディレクトリ構成

```
openspec/
├── specs/           # 確定した仕様（archive 時に更新される）
├── changes/         # 進行中の変更提案
│   └── archive/     # 完了した変更
└── config.yaml      # schema: spec-driven

.kiro/
├── steering/        # プロジェクト記憶（product.md / tech.md / structure.md / dogfooding.md / quality.md）※継続利用
└── specs/           # 【凍結】cc-sdd 時代の仕様 39 本。過去の記録として保持し、新規追加はしない
```

### 進行中の仕様

- 新規の変更は `openspec/changes/` 配下。`openspec list` / `/opsx:*` で確認する
- `.kiro/specs/` は**凍結**。ただし移行時点で進行中だった以下のみ、そのまま cc-sdd で完了させる:
  - `editor-surface-tokenization`（`tasks-generated`・実装が進行中のため中断しない）

### Steering の更新

コードに大きな変更があった場合は `/kiro:steering` を実行して steering ファイルを同期してください。
（steering は OpenSpec 移行後も継続利用する）

## ドッグフーディング（Phase 1）

Friction Log ノートブックに摩擦を記録（1 メモ = 1 摩擦）→ 毎週金曜トリアージで `#blocker` / `#major` / `#minor` をタグ付け → `#blocker` / `#major` を `/kiro:spec-init` で起票。

詳細運用は `.kiro/steering/dogfooding.md` を参照。

## ドキュメント

- **[プロジェクト計画](./docs/project-plan-2026.md)** - 2026年ロードマップ・マイルストーン
- **[デプロイガイド](./docs/deployment/)** - Cloud Run・Vercel のデプロイ手順
- **[開発ドキュメント](./docs/development/)** - 開発関連のドキュメント
