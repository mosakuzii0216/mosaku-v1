# CLAUDE.md

このファイルはリポジトリのコードを扱う際に Claude Code (claude.ai/code) へのガイダンスを提供します。

## アーキテクチャ概要

Mosaku はマルチテナント対応・OAuth 認証・テーマシステムを備えたフルスタックのメモ/ノートブックアプリです:

- **フロントエンド**: React 19 + TypeScript + Vite（Tailwind CSS）
- **バックエンド**: NestJS + TypeScript（Prisma ORM）
- **データベース**: Supabase PostgreSQL（クラウドマネージド）
- **インフラ**: Docker Compose（開発環境）、Vercel + Cloud Run + Supabase（本番）

### 主な機能
- タグ付き対応のマルチユーザーメモ・ノートブック管理
- JWT + OAuth 認証（Google、GitHub、X/Twitter）
- ユーザー登録用招待コードシステム
- CSS ファイルベースのカスタムテーマシステム
- ロールベースアクセス制御（FREE、PREMIUM、ADMIN）
- リッチテキストエディタ（TipTap）

## 開発コマンド

### モノレポコマンド（ルートから実行）
```bash
# 全依存関係をインストール
npm install

# フロントエンド・バックエンドを同時起動
npm run dev

# 両プロジェクトをビルド
npm run build

# 全コードをリント
npm run lint

# 全コードをフォーマット
npm run format
```

### Docker 環境
```bash
# 全サービスを起動（backend:3000、frontend:5173、nginx:80）
# 注意: データベースは Supabase（クラウド）でホスト
docker-compose up

# 全サービスを停止
docker-compose down

# リビルドして再起動
docker-compose up --build
```

### バックエンド開発（NestJS）
```bash
cd backend

# 開発
npm run start:dev          # ホットリロード付きウォッチモード
npm run start:debug        # デバッグモード（ウォッチ付き）

# ビルド・本番
npm run build              # TypeScript コンパイル
npm run start:prod         # 本番ビルドを実行

# テスト
npm run test               # ユニットテスト実行
npm run test:watch         # ウォッチモードでテスト
npm run test:e2e           # E2E テスト
npm run test:cov           # カバレッジレポート生成

# コード品質
npm run lint               # ESLint（自動修正あり）
npm run lint:fix           # 明示的な修正コマンド
npm run format             # Prettier フォーマット
npm run format:check       # 変更なしでフォーマット確認

# データベース
npx prisma migrate dev     # マイグレーション作成・適用
npx prisma migrate deploy  # マイグレーション適用（本番）
npx prisma generate        # Prisma クライアント生成
npx prisma studio          # Prisma Studio GUI を開く
npm run migration:apply    # migrate dev のエイリアス
npm run migration:deploy   # migrate deploy のエイリアス
```

### フロントエンド開発（React + Vite）
```bash
cd frontend

# 開発
npm run dev                # ポート 5173 で開発サーバー起動
npm run preview            # 本番ビルドをプレビュー

# ビルド
npm run build              # TypeScript チェック + Vite ビルド

# コード品質
npm run lint               # ESLint
npm run lint:fix           # ESLint（自動修正あり）
npm run format             # Prettier フォーマット
npm run format:check       # フォーマット確認
```

## アーキテクチャ詳細

### バックエンドモジュール構成

バックエンドは NestJS のモジュラーアーキテクチャに従い、明確に分離されています:

```
AppModule
├── ConfigModule（グローバル）- 環境設定の一元管理
├── PrismaModule（グローバル）- データベースアクセス層
├── CommonModule - 共有サービス（所有権チェック用 AuthorizationService）
├── AuthModule - 認証・認可（JWT + OAuth ストラテジー）
├── InvitationModule - 招待コード管理
├── MemoModule - メモの CRUD 操作
├── NotebookModule - ノートブック管理
├── TagModule - 多対多リレーション対応のタグシステム
└── ThemeModule - CSS ファイル対応のテーマ管理
```

**主なパターン:**
- 保護ルートにはすべて `@UseGuards(JwtAuthGuard)` を使用
- 公開エンドポイントは `@Public()` デコレータでマーク
- ユーザー所有権の検証は `AuthorizationService.checkOwnership()` で実施
- DTO は `class-validator` と `class-transformer` を使用
- すべてのモジュールはクロスモジュール依存のためサービスをエクスポート

### フロントエンド状態管理

**Zustand ストア**（クライアント状態）:
- `useMemoStore`: メモデータ、選択中メモ、表示状態（list/edit/create）、モバイル/デスクトップモード
- `useTagStore`: タグデータと管理

**React Context**:
- `AuthContext`: ユーザー認証状態、ログイン/ログアウト/OAuth フロー

**React Query**（サーバー状態）:
- すべての API コールはキャッシュと同期のために React Query を使用
- `useMemoQueries` などのカスタムフックが API エンドポイントをラップ

**表示状態フロー**:
アプリは `useMemoStore` で管理する `ObjectType`（'memo' | 'notebook' | 'tag'）と `ViewType`（'list' | 'edit' | 'create'）のステートマシンで表示を制御します。

### 認証フロー

**バックエンド:**
1. Passport ストラテジー（Google、GitHub、X）が OAuth フローを処理
2. 認証成功時にユーザーペイロード付き JWT トークンを返す
3. `JwtAuthGuard` が保護ルートでトークンを検証
4. `JwtStrategy` がトークンからユーザーを取り出してリクエストに付与

**フロントエンド:**
1. `AuthContext` が認証状態を管理
2. JWT は `AuthTokenManager` 経由で localStorage に保存
3. すべての API リクエストに `Authorization: Bearer <token>` ヘッダーを付与
4. OAuth フローはバックエンドの `/auth/{provider}` にリダイレクトし、トークン付きでフロントエンドに戻る

**招待コードシステム:**
- 新規ユーザーには招待コードが必要（管理者メールを除く）
- コードには最大使用回数と有効期限がある
- ユーザー作成前に検証される
- ADMIN ロールが `/admin/invitations` でコードを作成可能

### データベーススキーマの要点

**User モデル:**
- CUID プライマリキー
- OAuth（`oauthId`）とメール/パスワード（`password`）の両方をサポート
- ロールベースアクセス: `FREE`、`PREMIUM`、`ADMIN`
- 管理者は `ADMIN_EMAIL` 環境変数で決定

**Memo ↔ Notebook ↔ Tag リレーション:**
- メモは 1 つのノートブックに所属（任意、nullable）
- メモは `MemoTag` 中間テーブルで複数のタグを持てる
- ノートブックは `NotebookTag` 中間テーブルで複数のタグを持てる
- すべてのエンティティはユーザーにスコープ（カスケード削除）

**テーマシステム:**
- `cssFilePath` は `frontend/public/themes/` 内の CSS ファイルを指す
- テーマはシステム提供（`isSystem: true`）またはユーザー作成
- カテゴリでテーマを整理
- ユーザーはテーマをお気に入り登録可能

### Prisma クライアントの場所

Prisma クライアントは `backend/generated/prisma/` に生成されます（デフォルトの `node_modules` ではありません）。`schema.prisma` で以下のように設定されています:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}
```

スキーマ変更後は必ず `npx prisma generate` を実行してください。

## デプロイアーキテクチャ

アプリケーションは 2 つのデプロイモードをサポートします:

**ローカル開発:**
- Docker Compose が全サービスを統括
- Nginx リバースプロキシがトラフィックをルーティング
- PostgreSQL はコンテナ内

**本番（現在の構成）:**
- **フロントエンド**: Vercel（静的サイト）
- **バックエンド**: Google Cloud Run（コンテナ化した NestJS）
- **データベース**: Supabase PostgreSQL

本番デプロイ手順は [docs/deployment/](./docs/deployment/) を参照してください。

### 環境変数

**バックエンドの重要な変数:**
- `DATABASE_URL` - PostgreSQL 接続（Supabase のコネクションプーリング用）
- `DIRECT_URL` - PostgreSQL 直接接続（マイグレーション用）
- `JWT_SECRET` - JWT 署名キー
- `CORS_ORIGINS` - 許可オリジンのカンマ区切りリスト
- OAuth 認証情報: `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` など

**フロントエンドの重要な変数（`VITE_` プレフィックス必須）:**
- `VITE_BACKEND_URL` - バックエンド API の URL
- `VITE_SUPABASE_URL` - Supabase プロジェクトの URL
- `VITE_SUPABASE_ANON_KEY` - Supabase 匿名キー
- フロントエンド用 OAuth クライアント ID: `VITE_GOOGLE_CLIENT_ID` など

## 実装上の重要な注意点

### 保護エンドポイントの追加

```typescript
@Controller('resource')
@UseGuards(JwtAuthGuard)  // 全ルートに適用
export class ResourceController {
  @Get()
  findAll(@Request() req: AuthenticatedRequest) {
    const userId = req.user.id;  // JWT からのユーザー
    // ... 実装
  }

  @Public()  // 特定ルートのガードを上書き
  @Get('public')
  publicEndpoint() {
    // 認証不要
  }
}
```

### 所有権バリデーションパターン

```typescript
// サービス内
constructor(
  private prisma: PrismaService,
  private authService: AuthorizationService,
) {}

async update(id: string, userId: string, data: UpdateDto) {
  const resource = await this.prisma.resource.findUnique({ where: { id } });
  // ユーザーがリソースを所有していない場合 ForbiddenException をスロー
  this.authService.checkOwnership(resource, userId);
  // ... 更新ロジック
}
```

### フロントエンド API コールパターン

```typescript
// utils/api.ts の API_BASE_URL を使用
const response = await fetch(`${API_BASE_URL}/endpoint`, {
  headers: {
    'Authorization': `Bearer ${AuthTokenManager.getAccessToken()}`,
    'Content-Type': 'application/json',
  },
});
```

### テーマシステム

テーマは `frontend/public/themes/{category}/{theme-name}.css` の CSS ファイルです。テーマサービスは:
1. テーマのメタデータ（名前、カテゴリ、cssFilePath）をデータベースに保存
2. テーマ選択時にフロントエンドが CSS ファイルを動的にロード
3. CSS 変数で色・タイポグラフィ・レイアウトなどを定義

### テスト戦略

- **バックエンド**: ユニットテストに Jest、E2E に Supertest
- **フロントエンド**: テストフレームワーク未導入
- TDD ワークフローには `npm run test:watch` を使用
- カバレッジレポートは `backend/coverage/` に生成

## よくある落とし穴

1. **Prisma クライアントが見つからない**: スキーマ変更のプル後に `npx prisma generate` を実行
2. **CORS エラー**: `CORS_ORIGINS` にフロントエンドの URL が含まれているか確認
3. **OAuth リダイレクト不一致**: OAuth プロバイダーのコールバック URL が `{BACKEND_URL}/auth/{provider}/callback` に一致しているか確認
4. **マイグレーション競合**: 新しいマイグレーションを作成する前に最新のマイグレーションをプル
5. **Docker ポート競合**: ポート 80、3000、5173 が使用可能か確認
6. **環境変数**: フロントエンド変数は公開のために `VITE_` プレフィックスが必須
7. **Supabase 接続**: マイグレーション用に `DATABASE_URL` はプーリング接続（ポート 6543）、`DIRECT_URL` は直接接続（ポート 5432）を使用していること

## 仕様駆動開発（SDD）

本プロジェクトでは仕様駆動開発を採用しています。新機能の開発時は、実装前にステアリングファイル（仕様書）を作成します。

### ワークフロー

```
/add-feature {機能名}
```

このコマンドで以下が自動実行されます:
1. プロジェクト理解・既存パターン調査
2. ステアリングファイル生成（requirements → design → tasklist）
3. タスクリストに基づく実装
4. コードレビュー・品質検証
5. 振り返り記録

### ディレクトリ構成

```
.claude/
├── commands/add-feature.md       # 新機能開発コマンド
├── skills/steering/              # ステアリング管理スキル
│   ├── SKILL.md
│   └── templates/                # 仕様書テンプレート
└── agents/code-reviewer.md       # コードレビューエージェント

.steering/                        # 生成された仕様書（Git管理対象）
├── {YYYYMMDD}-{機能名}/          # 機能開発ディレクトリ
│   ├── brainstorm.md             # /brainstorm 経由の場合のみ
│   ├── requirements.md           # 要件定義
│   ├── design.md                 # 設計
│   └── tasklist.md               # タスクリスト + 振り返り
└── {YYYYMMDD}-explore/           # 機能未決のブレスト
    └── brainstorm.md
```

**命名規則**: 全エントリ `{YYYYMMDD}-{kebab-case-name}/` ディレクトリに統一

### 重要なルール

- 新機能開発時は必ず `/add-feature` を使用する
- 実装中は常に `tasklist.md` を参照し、完了タスクを `[x]` に更新する
- ステアリングファイルはGit管理対象。仕様変更があれば反映する
- **ファイルを変更したタスクの完了時は、必ずコミット分割案とメッセージを提案すること**

## ドキュメント

詳細な技術ドキュメントは [docs/](./docs) ディレクトリを参照してください:

- **[移行計画](./docs/migration/overview.md)** - クラウド移行ロードマップと詳細計画
- **[デプロイガイド](./docs/deployment/)** - Cloud Run・Vercel のデプロイ手順
- **[開発ドキュメント](./docs/development/)** - 開発関連のドキュメント

全ドキュメントは [docs/README.md](./docs/README.md) に整理されています。
