# 写経キャッチアップ計画

プロジェクト全体を手で書き写しながら、技術スタックの理解とコードベースの把握を同時に行う。

## 全体方針

- **写経対象**: 約12,800行（backend ~4,500行 / frontend ~4,100行 / 設定・スキーマ等）
- **進め方**: データベース → Backend基盤 → Backendモジュール → Frontend基盤 → Frontendコンポーネント
- **各フェーズで**: 1) 技術ドキュメントを読む → 2) 写経する → 3) 動作確認する

---

## Phase 0: データモデルの理解
**学ぶ技術**: Prisma ORM
**所要目安**: 2〜3時間

### 事前学習
- [Prisma公式 - Schema概要](https://www.prisma.io/docs/orm/prisma-schema/overview)
- リレーション（1:N, N:N）、`@@map`、cascade delete

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/prisma/schema.prisma` | 163 | 全モデルのリレーション、CUID、Enum、@@map |

### 理解チェック
- [ ] ER図を手書きできるか（User, Memo, Notebook, Tag, Theme, InvitationCode）
- [ ] MemoTag/NotebookTag の中間テーブルパターンを説明できるか
- [ ] cascade delete の影響範囲を把握しているか

---

## Phase 1: Backend設定と起動基盤
**学ぶ技術**: NestJS（Module, Provider, DI）、環境変数管理
**所要目安**: 2〜3時間

### 事前学習
- [NestJS公式 - First Steps](https://docs.nestjs.com/first-steps)
- [NestJS公式 - Modules](https://docs.nestjs.com/modules)
- [NestJS公式 - Providers](https://docs.nestjs.com/providers)

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/main.ts` | 72 | NestFactory, Helmet, CORS, ValidationPipe, セッション |
| `backend/src/app.module.ts` | 40 | @Module imports/providers、ThrottlerModule |
| `backend/src/config/config.module.ts` | 9 | Global module パターン |
| `backend/src/config/config.service.ts` | 124 | @Injectable, 環境変数の型安全な取得 |
| `backend/src/config/auth-constants.ts` | 38 | JWT有効期限、bcryptラウンド数 |
| `backend/src/config/features.config.ts` | 134 | フィーチャーフラグ設計 |
| `backend/src/prisma/prisma.module.ts` | 8 | Global module + export |
| `backend/src/prisma/prisma.service.ts` | 15 | PrismaClient の DI ラッパー |

**合計**: ~440行

### 理解チェック
- [ ] NestJSの DI コンテナがどうモジュール間の依存を解決するか説明できるか
- [ ] `Global()` デコレータの役割を理解しているか
- [ ] `main.ts` の各ミドルウェアが何を防御しているか説明できるか

---

## Phase 2: 共通基盤（認可・例外・ベースサービス）
**学ぶ技術**: NestJS（Guards, Filters, 例外処理）、テンプレートメソッドパターン
**所要目安**: 3〜4時間

### 事前学習
- [NestJS公式 - Exception Filters](https://docs.nestjs.com/exception-filters)
- [NestJS公式 - Guards](https://docs.nestjs.com/guards)
- テンプレートメソッドパターン（GoF）

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/common/common.module.ts` | 9 | モジュールのexport設計 |
| `backend/src/common/services/authorization.service.ts` | 76 | 所有権チェックの共通化 |
| `backend/src/common/services/base-ownable.service.ts` | 140 | **重要** 抽象基底クラス、テンプレートメソッド |
| `backend/src/common/exceptions/app.exception.ts` | 83 | カスタム例外クラス |
| `backend/src/common/exceptions/error-codes.ts` | 67 | エラーコード定義（Enum） |
| `backend/src/common/exceptions/error-messages.ts` | ~50 | エラーメッセージマッピング |
| `backend/src/common/filters/throttler-exception.filter.ts` | ~30 | レート制限フィルタ |
| `backend/src/common/logger/app-logger.service.ts` | 63 | カスタムロガー |
| `backend/src/common/dto/pagination.dto.ts` | 72 | ページネーションDTO |
| `backend/src/common/constants/prisma-selects.ts` | 38 | Prisma select の定数化 |

**合計**: ~630行

### 理解チェック
- [ ] `BaseOwnableService` の抽象メソッドがどう具象クラスで実装されるか図示できるか
- [ ] `checkOwnership()` がどの層（Controller/Service）で呼ばれるか説明できるか
- [ ] AppException → HTTP レスポンスの変換フローを説明できるか

---

## Phase 3: 認証モジュール
**学ぶ技術**: Passport.js、JWT、OAuth 2.0、bcrypt
**所要目安**: 6〜8時間（最も複雑）

### 事前学習
- [NestJS公式 - Authentication](https://docs.nestjs.com/security/authentication)
- [Passport.js - JWT Strategy](http://www.passportjs.org/packages/passport-jwt/)
- JWT の仕組み（Header, Payload, Signature）
- OAuth 2.0 の Authorization Code Flow

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/auth/auth.module.ts` | 45 | PassportModule, JwtModule 登録 |
| `backend/src/auth/types.ts` | 32 | AuthenticatedRequest 型定義 |
| `backend/src/auth/types/oauth.types.ts` | 65 | OAuthプロファイル型 |
| `backend/src/auth/public.decorator.ts` | ~10 | カスタムデコレータ |
| `backend/src/auth/jwt.strategy.ts` | 40 | Passport JWT Strategy |
| `backend/src/auth/jwt-auth.guard.ts` | 40 | @Public() を考慮したGuard |
| `backend/src/auth/google.strategy.ts` | 44 | Google OAuth Strategy |
| `backend/src/auth/github.strategy.ts` | 41 | GitHub OAuth Strategy |
| `backend/src/auth/x.strategy.ts` | 41 | X/Twitter OAuth Strategy |
| `backend/src/auth/oauth-auth.guards.ts` | ~30 | OAuth用Guard群 |
| `backend/src/auth/validators/password-strength.validator.ts` | 118 | カスタムバリデータ |
| `backend/src/auth/dto/*.ts` (6ファイル) | ~120 | class-validator デコレータ |
| `backend/src/auth/auth.service.ts` | 368 | **最重要** bcrypt, JWT生成, OAuth統合 |
| `backend/src/auth/auth.controller.ts` | 469 | **最重要** 全認証エンドポイント |

**合計**: ~1,460行

### 推奨順序
1. 型定義（types.ts, oauth.types.ts）
2. デコレータとGuard（public.decorator → jwt-auth.guard → oauth-auth.guards）
3. Strategy（jwt → google → github → x）
4. DTO（login → create-user → reset-password → OAuth registration DTOs）
5. バリデータ（password-strength.validator）
6. Service（auth.service.ts）— ここが核心
7. Controller（auth.controller.ts）— Service を使うエンドポイント

### 理解チェック
- [ ] JWT トークンの生成→検証→Guard の一連の流れを図示できるか
- [ ] OAuth のリダイレクトフロー（Frontend → Backend → Provider → Callback → Frontend）を説明できるか
- [ ] `@Public()` デコレータが Guard 内でどう判定されるか説明できるか
- [ ] 招待コード付き OAuth 登録のフローを説明できるか

---

## Phase 4: CRUDモジュール群
**学ぶ技術**: NestJS（Controller, DTO, class-validator）、Prisma CRUD
**所要目安**: 5〜6時間

### 事前学習
- [NestJS公式 - Controllers](https://docs.nestjs.com/controllers)
- [class-validator README](https://github.com/typestack/class-validator)
- [Prisma - CRUD](https://www.prisma.io/docs/orm/prisma-client/queries/crud)

### 4-A: Notebook（最もシンプル、入門に最適）

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/notebook/notebook.module.ts` | 13 | 最小のModule構成 |
| `backend/src/notebook/dto/create-notebook.dto.ts` | 16 | @IsString, @IsOptional, @MaxLength |
| `backend/src/notebook/dto/update-notebook.dto.ts` | 16 | 同上 |
| `backend/src/notebook/notebook.service.ts` | 70 | BaseOwnableService の具象実装 |
| `backend/src/notebook/notebook.controller.ts` | 51 | CRUD エンドポイント5つ |

**合計**: ~170行

### 4-B: Memo（検索・ページネーション付き）

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/memo/memo.module.ts` | 13 | |
| `backend/src/memo/dto/create-memo.dto.ts` | ~20 | |
| `backend/src/memo/dto/update-memo.dto.ts` | ~20 | |
| `backend/src/memo/dto/search-memo.dto.ts` | ~15 | 検索クエリDTO |
| `backend/src/memo/memo.service.ts` | 228 | 検索、タグフィルタ、ページネーション |
| `backend/src/memo/memo.controller.ts` | 105 | 9エンドポイント |

**合計**: ~400行

### 4-C: Tag（多対多リレーション）

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/tag/tag.module.ts` | 13 | |
| `backend/src/tag/dto/*.ts` (4ファイル) | ~60 | assign-tags.dto が特徴的 |
| `backend/src/tag/tag.service.ts` | 210 | Memo/Notebook へのタグ割当 |
| `backend/src/tag/tag.controller.ts` | 87 | |

**合計**: ~370行

### 4-D: Theme（最も複雑なCRUD）

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/theme/theme.module.ts` | 13 | |
| `backend/src/theme/dto/*.ts` (4ファイル) | ~80 | 検索DTO のフィルタが豊富 |
| `backend/src/types/theme.types.ts` | 135 | スタイル定義の型 |
| `backend/src/theme/theme.service.ts` | 413 | アクセス制御、公開/非公開 |
| `backend/src/theme/theme.controller.ts` | 152 | お気に入りトグル含む |

**合計**: ~790行

### 4-E: Invitation（独立した小モジュール）

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `backend/src/invitation/invitation.module.ts` | 13 | |
| `backend/src/invitation/dto/*.ts` (2ファイル) | ~30 | |
| `backend/src/invitation/invitation.service.ts` | 97 | コード生成、有効期限、使用回数 |
| `backend/src/invitation/invitation.controller.ts` | 78 | 管理者用エンドポイント含む |

**合計**: ~220行

### 推奨順序: Notebook → Invitation → Memo → Tag → Theme

### 理解チェック
- [ ] `BaseOwnableService` を継承した具象サービスの実装パターンを説明できるか
- [ ] Prisma の `include` と `select` の使い分けを理解しているか
- [ ] N:N リレーション（MemoTag）の作成・削除パターンを説明できるか
- [ ] Theme のアクセス制御（system/public/private）を図示できるか

---

## Phase 5: Frontend 型定義・定数・ユーティリティ
**学ぶ技術**: TypeScript（型設計）、環境変数管理
**所要目安**: 4〜5時間

### 事前学習
- TypeScript: interface vs type、ジェネリクス
- Vite の環境変数（`import.meta.env`）

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/types/enums.ts` | 31 | ViewType, ObjectType |
| `frontend/src/types/memo.ts` | 35 | バックエンドとの型の対応 |
| `frontend/src/types/tag.ts` | 33 | |
| `frontend/src/types/notebook.ts` | 23 | |
| `frontend/src/types/theme.ts` | 137 | 最も複雑な型定義 |
| `frontend/src/types/pagination.ts` | 35 | ジェネリクス `PaginatedResult<T>` |
| `frontend/src/types/invitation.ts` | 11 | |
| `frontend/src/constants/queryKeys.ts` | 49 | React Query キーファクトリ |
| `frontend/src/constants/cacheConfig.ts` | 108 | staleTime/gcTime設計 |
| `frontend/src/constants/features.ts` | 120 | フィーチャーフラグ |
| `frontend/src/utils/env.ts` | 161 | VITE_環境変数の型安全な取得 |
| `frontend/src/utils/logger.ts` | 76 | 開発時のみログ出力 |
| `frontend/src/utils/passwordValidator.ts` | 156 | バックエンドと同じルールをクライアントでも |

**合計**: ~975行

### 理解チェック
- [ ] frontend の型と backend の Prisma モデルの対応関係を説明できるか
- [ ] queryKeys の構造が React Query のキャッシュ無効化にどう影響するか説明できるか

---

## Phase 6: Frontend API クライアント・認証ユーティリティ
**学ぶ技術**: fetch API、トークン管理、localStorage
**所要目安**: 4〜5時間

### 事前学習
- fetch API と Authorization ヘッダ
- localStorage でのトークン永続化

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/utils/api.ts` | 395 | **最重要** 全APIエンドポイントの集約 |
| `frontend/src/utils/auth.ts` | 273 | AuthTokenManager, AuthAPI, UserProfile型 |
| `frontend/src/utils/oauthAuth/BaseOAuthAuth.ts` | 89 | OAuth基底クラス |
| `frontend/src/utils/oauthAuth.ts` | 86 | Google/GitHub/X の具象クラス |

**合計**: ~843行

### 推奨順序
1. `auth.ts`（AuthTokenManager → AuthAPI）
2. `oauthAuth/BaseOAuthAuth.ts` → `oauthAuth.ts`
3. `api.ts`（全エンドポイント）

### 理解チェック
- [ ] APIリクエスト時の認証ヘッダ付与の仕組みを説明できるか
- [ ] トークンの保存・取得・削除のライフサイクルを図示できるか
- [ ] OAuth コールバックの URL パラメータ解析を説明できるか

---

## Phase 7: Frontend 状態管理
**学ぶ技術**: Zustand、React Context、React Query
**所要目安**: 5〜6時間

### 事前学習
- [Zustand README](https://github.com/pmndrs/zustand)
- [React Query公式 - Quick Start](https://tanstack.com/query/latest/docs/react/quick-start)
- React Context + useContext パターン

### 7-A: Zustand Stores

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/stores/useViewStore.ts` | 101 | UI状態マシン（ObjectType × ViewType） |
| `frontend/src/stores/useMemoDataStore.ts` | 49 | メモデータのローカルキャッシュ |
| `frontend/src/stores/useTagStore.ts` | 95 | タグフィルタリングロジック |
| `frontend/src/stores/usePaletteStore.ts` | 34 | パレットモーダル状態 |
| `frontend/src/stores/useMemoStore.ts` | 172 | **Facade** 上記ストアの統合アダプタ |

**合計**: ~451行

### 7-B: React Context（認証）

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/contexts/AuthContext.tsx` | 238 | Provider + useContext パターン |

### 7-C: React Query Hooks

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/hooks/useNotebookQueries.ts` | 54 | 最もシンプルな Query/Mutation |
| `frontend/src/hooks/useTagQueries.ts` | 90 | assignTags のキャッシュ無効化 |
| `frontend/src/hooks/useMemoQueries.ts` | 125 | タグフィルタ付き検索 |
| `frontend/src/hooks/useThemeQueries.ts` | 232 | 複雑なフィルタ・お気に入り |

### 7-D: 認証 Hooks

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/hooks/useAuth.ts` | 124 | AuthContext のラッパー |
| `frontend/src/hooks/useEmailAuth.ts` | 98 | メール認証ロジック |
| `frontend/src/hooks/useOAuth.ts` | 161 | OAuthフロー制御 |

### 7-E: ユーティリティ Hooks

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/hooks/useWindowSize.ts` | 31 | resize イベント |
| `frontend/src/hooks/useAppInit.ts` | 16 | 初期データロード |
| `frontend/src/hooks/useThemeCSS.ts` | 65 | 動的CSS読み込み |
| `frontend/src/hooks/useMemoPalette.ts` | 45 | キーボードショートカット |

**Phase 7 合計**: ~1,600行

### 推奨順序
1. Zustand stores（useViewStore → usePaletteStore → useMemoDataStore → useTagStore → useMemoStore）
2. React Query hooks（useNotebookQueries → useTagQueries → useMemoQueries → useThemeQueries）
3. 認証（useEmailAuth → useOAuth → AuthContext → useAuth）
4. ユーティリティhooks

### 理解チェック
- [ ] Zustand と React Query の責務の違いを説明できるか（クライアント状態 vs サーバー状態）
- [ ] useMutation の onSuccess でキャッシュ無効化するパターンを説明できるか
- [ ] AuthContext が Provider パターンでどう全コンポーネントに認証状態を配信するか説明できるか
- [ ] useMemoStore が他の3ストアをどうFacadeしているか説明できるか

---

## Phase 8: Frontend コンポーネント
**学ぶ技術**: React 19、TipTap、Tailwind CSS、レスポンシブ設計
**所要目安**: 8〜10時間

### 事前学習
- [TipTap公式 - Getting Started](https://tiptap.dev/docs/editor/getting-started)
- [Tailwind CSS - Utility-First](https://tailwindcss.com/docs/utility-first)

### 8-A: エントリポイント・レイアウト

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/main.tsx` | 21 | React 19 の createRoot |
| `frontend/src/App.tsx` | 72 | QueryClient設定、Router、Provider階層 |
| `frontend/src/components/layouts/DesktopLayout.tsx` | 133 | ビュー状態マシンの実体化 |
| `frontend/src/components/layouts/MobileLayout.tsx` | 116 | レスポンシブ版 |

**合計**: ~342行

### 8-B: 認証コンポーネント

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/components/auth/AuthGuard.tsx` | ~40 | 認証必須ラッパー |
| `frontend/src/components/auth/AuthCallback.tsx` | ~50 | OAuthリダイレクト処理 |
| `frontend/src/components/auth/AuthForm.tsx` | ~150 | ログイン/登録フォーム |
| `frontend/src/components/auth/EmailAuthForm.tsx` | ~120 | メール認証フォーム |
| `frontend/src/components/auth/OAuthInviteForm.tsx` | ~100 | 招待コード + OAuth |
| `frontend/src/components/auth/OAuthWithInviteForm.tsx` | ~130 | 招待コード付きOAuth登録 |
| `frontend/src/components/auth/PasswordReset.tsx` | ~80 | パスワードリセット画面 |
| `frontend/src/components/auth/PasswordResetForm.tsx` | ~100 | リセットフォーム |

**合計**: ~770行

### 8-C: メモコンポーネント

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/components/memo/MemoItem.tsx` | 61 | 単一メモの表示 |
| `frontend/src/components/memo/MemoList.tsx` | 63 | リスト描画、タグフィルタ |
| `frontend/src/components/memo/MemoSearch.tsx` | 69 | デバウンス付き検索 |
| `frontend/src/components/memo/MemoEditor.tsx` | 298 | **複雑** TipTap統合、タグ・ノートブック割当 |
| `frontend/src/components/memo/MemoPalette.tsx` | 371 | **複雑** キーボードナビゲーション |

**合計**: ~862行

### 8-D: タグコンポーネント

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/components/tag/TagChip.tsx` | 50 | 最小コンポーネント |
| `frontend/src/components/tag/TagFilter.tsx` | 59 | フィルタトグル |
| `frontend/src/components/tag/TagDropdownIcon.tsx` | 79 | ドロップダウン |
| `frontend/src/components/tag/TagSelector.tsx` | 134 | マルチセレクト |
| `frontend/src/components/tag/TagForm.tsx` | 145 | 作成/編集フォーム |
| `frontend/src/components/tag/TagManager.tsx` | 193 | タグ管理画面 |

**合計**: ~660行

### 8-E: ノートブック・その他

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/components/notebook/NotebookList.tsx` | 135 | |
| `frontend/src/components/notebook/NotebookEditor.tsx` | 227 | テーマ選択、タグ割当 |
| `frontend/src/components/editor/RichTextEditor.tsx` | ~150 | TipTap ラッパー |
| `frontend/src/components/editor/SlashCommandList.tsx` | 143 | スラッシュコマンドUI |
| `frontend/src/components/editor/suggestion.ts` | ~50 | TipTap suggestion設定 |
| `frontend/src/components/ui/Header.tsx` | 147 | ナビゲーションバー |
| `frontend/src/components/ui/OAuthLoginButton.tsx` | 120 | OAuth ボタン |
| `frontend/src/components/ui/PasswordInput.tsx` | 147 | パスワード入力 |
| `frontend/src/components/admin/InvitationManager.tsx` | ~150 | 管理者画面 |

**合計**: ~1,270行

### 推奨順序
1. エントリ（main.tsx → App.tsx → Layouts）
2. UI部品（Header → PasswordInput → OAuthLoginButton）
3. 認証（AuthGuard → AuthCallback → AuthForm → 残り）
4. タグ（TagChip → TagFilter → TagSelector → TagForm → TagManager）
5. メモ（MemoItem → MemoList → MemoSearch → MemoEditor → MemoPalette）
6. ノートブック（NotebookList → NotebookEditor）
7. エディタ（RichTextEditor → SlashCommandList → suggestion）
8. 管理（InvitationManager）

---

## Phase 9: テーマシステム
**学ぶ技術**: CSS Variables、動的スタイル適用
**所要目安**: 3〜4時間

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/src/utils/themeUtils.ts` | 295 | CSS変数抽出・マージ |
| `frontend/src/utils/themeLoader.ts` | 122 | 動的CSSファイル読み込み |
| `frontend/src/utils/themeApplier.ts` | 194 | DOMへのテーマ適用 |
| `frontend/public/themes/` 内のCSS | ~250 | 5テーマ分のCSS |

**合計**: ~860行

---

## Phase 10: 設定ファイル・インフラ
**学ぶ技術**: Vite、Docker Compose、Tailwind CSS設定、ESLint
**所要目安**: 2〜3時間

### 写経対象

| ファイル | 行数 | ポイント |
|---------|------|---------|
| `frontend/vite.config.ts` | 75 | PWA設定、HMR |
| `frontend/tailwind.config.js` | ~30 | Tailwindカスタマイズ |
| `frontend/vitest.config.ts` | ~15 | テスト設定 |
| `docker-compose.yml` | 68 | マルチサービス構成 |
| `nginx/` 設定ファイル | ~30 | リバースプロキシ |
| `eslint.common.mjs` | ~30 | 共通Lint設定 |
| 各 `tsconfig.json` | ~100 | TypeScript設定の関係性 |

**合計**: ~350行

---

## Phase 11: End-to-End フロー確認
**所要目安**: 3〜4時間

写経完了後、以下のフローをコードを追いながら手で図示する:

### フロー1: メモ作成
```
ボタン押下 → goToMemoCreate() → ViewStore更新 → Layout再描画
→ MemoEditor表示 → タイトル入力 → 保存ボタン
→ useCreateMemo() → api.createMemo() → fetch POST /memos
→ Backend: JwtAuthGuard → MemoController.create() → MemoService.create()
→ Prisma INSERT → レスポンス → onSuccess → invalidateQueries
→ useMemos() 再取得 → MemoList 再描画
```

### フロー2: OAuth ログイン
```
OAuthLoginButton押下 → GoogleAuthUtils.startGoogleAuth()
→ window.location.href = /auth/google
→ Backend: GoogleStrategy → Google認証画面
→ コールバック → AuthController → JWT生成
→ Frontend リダイレクト → AuthCallback
→ parseAuthCallback() → token取得 → AuthTokenManager.setAccessToken()
→ AuthContext 更新 → AuthGuard 通過 → メイン画面表示
```

### フロー3: タグによるメモフィルタリング
```
TagFilter でタグ選択 → useTagStore.toggleTag()
→ selectedTags 更新 → useMemos() の queryKey変更
→ React Query 再フェッチ → GET /memos?tagIds=...
→ Backend: MemoService.findAll(userId, tagIds)
→ Prisma WHERE + JOIN → フィルタ結果返却
→ MemoList 再描画
```

---

## 全体サマリ

| Phase | 対象 | 行数目安 | 学ぶ技術 |
|-------|------|---------|---------|
| 0 | データモデル | 163 | Prisma Schema |
| 1 | Backend設定・起動 | 440 | NestJS Module/DI |
| 2 | 共通基盤 | 630 | Guard, Filter, テンプレートメソッド |
| 3 | 認証モジュール | 1,460 | Passport, JWT, OAuth, bcrypt |
| 4 | CRUDモジュール群 | 1,950 | NestJS CRUD, Prisma, class-validator |
| 5 | Frontend 型・定数・util | 975 | TypeScript型設計 |
| 6 | API・認証util | 843 | fetch, localStorage, トークン管理 |
| 7 | 状態管理 | 1,600 | Zustand, React Query, Context |
| 8 | コンポーネント | 3,900 | React, TipTap, Tailwind |
| 9 | テーマシステム | 860 | CSS Variables, 動的スタイル |
| 10 | 設定・インフラ | 350 | Vite, Docker, ESLint |
| 11 | E2Eフロー確認 | — | アーキテクチャ統合理解 |
| **合計** | | **~13,170** | |
