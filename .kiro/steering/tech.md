# Technology Stack

## Architecture

TypeScriptモノレポ。`backend/`（NestJS API）と `frontend/`（React SPA）の2パッケージ構成。インフラはVercel（FE）+ Google Cloud Run（BE）+ Supabase PostgreSQL（DB）。

## Core Technologies

- **Language**: TypeScript（backend・frontend 共通）
- **Backend**: NestJS 11、Prisma ORM、Node.js 20+
- **Frontend**: React 19、Vite 6、Tailwind CSS 3
- **Database**: PostgreSQL（Supabase）、Prisma client は `node_modules/@prisma/client` に生成（デフォルト）

## Key Libraries

| ライブラリ                                                                                                                                         | 用途                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@tanstack/react-query`                                                                                                                            | サーバー状態管理（唯一の真実の源泉）               |
| `zustand`                                                                                                                                          | クライアントUIの状態管理（表示状態・選択状態）     |
| `@tiptap/react`                                                                                                                                    | リッチテキストエディタ                             |
| `passport` + `passport-jwt` / `passport-google-oauth20` / `passport-github2` / `passport-line-auth` / `passport-apple` / `passport-twitter-oauth2` | 認証ストラテジー（Google・GitHub・LINE・Apple・X） |
| `class-validator` + `class-transformer`                                                                                                            | DTO バリデーション                                 |
| `zod`                                                                                                                                              | スキーマ定義（BE・FE共有型に利用）                 |

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

- Node.js 20+
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

---

_Document standards and patterns, not every dependency_
