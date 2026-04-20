# Technology Stack

## Architecture

TypeScriptモノレポ。`backend/`（NestJS API）と `frontend/`（React SPA）の2パッケージ構成。インフラはVercel（FE）+ Google Cloud Run（BE）+ Supabase PostgreSQL（DB）。

## Core Technologies

- **Language**: TypeScript（backend・frontend 共通）
- **Backend**: NestJS 11、Prisma ORM、Node.js 22+（ルート `package.json` の `engines` で統一）
- **Frontend**: React 19、Vite 6、Tailwind CSS 3
- **Database**: PostgreSQL（Supabase）、Prisma client は `node_modules/@prisma/client` に生成（デフォルト）

## Key Libraries

| ライブラリ                                                                                                                                         | 用途                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@tanstack/react-query`                                                                                                                            | サーバー状態管理（唯一の真実の源泉）                                                            |
| `zustand`                                                                                                                                          | クライアントUIの状態管理（表示状態・選択状態）                                                  |
| `@tiptap/react`                                                                                                                                    | リッチテキストエディタ                                                                          |
| `passport` + `passport-jwt` / `passport-google-oauth20` / `passport-github2` / `passport-line-auth` / `passport-apple` / `passport-twitter-oauth2` | 認証ストラテジー（Google・GitHub・LINE・Apple・X）                                              |
| `class-validator` + `class-transformer`                                                                                                            | DTO バリデーション                                                                              |
| `zod`                                                                                                                                              | スキーマ定義（BE・FE共有型に利用）                                                              |
| `@sentry/nestjs` + `@sentry/profiling-node` / `@sentry/react`                                                                                      | エラートラッキング・パフォーマンス監視（BE: `instrument.ts` で初期化、FE: `main.tsx` で初期化） |
| `@nestjs/throttler`                                                                                                                                | レート制限（`ThrottlerExceptionFilter` でレスポンス整形）                                       |
| `@nestjs/schedule`                                                                                                                                 | スケジュールタスク（`trash-cleanup.service.ts` でゴミ箱の30日経過メモを自動完全削除）           |
| `helmet`                                                                                                                                           | セキュリティヘッダー（CSP含む）を `main.ts` で適用                                              |
| `vite-plugin-pwa`                                                                                                                                  | PWA 対応（マニフェスト・Service Worker）                                                        |

## Development Standards

### Type Safety

- TypeScript strict mode（`noImplicitAny`、`strictNullChecks`）
- DTO には `class-validator` デコレータを使用
- `any` 使用は禁止

### Code Quality

- ESLint + Prettier（両パッケージに設定あり）
- コミット前に `npm run lint` と `npm run format:check` が通ること

### Testing

- バックエンド: Jest（`*.spec.ts`）、E2E: Supertest
- フロントエンド: Vitest + Testing Library（`*.test.ts`）。`useAutoSave`・`useNavigation` のユニットテストあり

## Development Environment

### Required Tools

- Node.js 22+
- Docker（ローカル開発用）

### Common Commands

```bash
# Dev（ルートから）
npm run dev

# Backend only
cd backend && npm run start:dev

# Frontend only
cd frontend && npm run dev

# Build
npm run build

# DB
cd backend && npx prisma migrate dev
cd backend && npx prisma generate
```

## Key Technical Decisions

- **React Query をサーバー状態の唯一の真実の源泉とする**: Zustand へのデータコピーは行わない。Zustand はUI状態（表示モード・選択状態）専用
- **グローバル JWT Guard + @Public() opt-out**: 全ルートをデフォルト保護し、公開エンドポイントのみ `@Public()` デコレータで明示的に除外する
- **Prisma client の生成場所**: `node_modules/@prisma/client`（デフォルト）。スキーマ変更後は `npx prisma generate` 必須
- **テーマは CSS ファイルで管理**: `frontend/public/themes/{category}/{name}.css`。CSS 変数で色・タイポグラフィを定義し、DBにはメタデータのみ保存
- **AuthService の責務分離**: `AuthService`（ユーザー管理）、`JwtTokenService`（JWT発行・検証）、`OAuthService`（OAuth処理）の3クラスに分離済み
- **テーマエフェクトはコード分割でロード**: `themeEffectRegistry` の動的 import を `React.lazy` で遅延ロードし、エフェクト未指定テーマでは独立チャンクをネットワーク層でも取得しない。エフェクト用の新規 JS ライブラリは追加しない方針（CSS keyframes + Canvas API のみで完結させる）
- **テーマエフェクトの自動停止条件**: `prefers-reduced-motion` / エディタフォーカス中 / タブ非表示 / マウス3秒アイドル のいずれかで RAF を停止し、CPU・GPU負荷をエディタ作業時に渡す
- **Sentry 初期化は最初の import**: `backend/src/main.ts` の先頭で `import './instrument'` を行い、NestFactory 生成より前に Sentry を起動する（プロセス起動初期からの捕捉を担保）
- **ゴミ箱は Soft Delete + スケジュール削除**: `trashedAt` カラムで論理削除し、`@nestjs/schedule` の cron（毎日 JST 02:00）で 30 日経過後に物理削除する。クライアントは `/trash` エンドポイント経由で復元・完全削除を行う

---

_Document standards and patterns, not every dependency_
