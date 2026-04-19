# 写経キャッチアップ計画

プロジェクト全体を手で書き写しながら、技術スタックの理解とコードベースの把握を同時に行う。

## 全体方針

- **写経対象**: 約14,400行（backend ~7,500行 / frontend ~6,900行）※テストファイルは除く
- **進め方**: データベース → Backend基盤 → Backendモジュール → Frontend基盤 → Frontendコンポーネント
- **各フェーズで**: 1) 技術ドキュメントを読む → 2) 写経する → 3) 動作確認する

> 進捗トラッキングは [catchup-progress.md](./catchup-progress.md) で管理
> 理解度テスト結果は [catchup-assessment.md](./catchup-assessment.md) を参照

---

## Phase 0: データモデルの理解

**学ぶ技術**: Prisma ORM
**所要目安**: 2〜3時間

### 事前学習

- [Prisma公式 - Schema概要](https://www.prisma.io/docs/orm/prisma-schema/overview)
- リレーション（1:N, N:N）、`@@map`、cascade delete

### 写経対象

| ファイル                       | 行数 | ポイント                                  |
| ------------------------------ | ---- | ----------------------------------------- |
| `backend/prisma/schema.prisma` | 166  | 全モデルのリレーション、CUID、Enum、@@map |

### 理解チェック

- [ ] ER図を手書きできるか（User, Memo, Notebook, Tag, Theme, InvitationCode, Category, UserFavoriteTheme）
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

| ファイル                                | 行数 | ポイント                                                   |
| --------------------------------------- | ---- | ---------------------------------------------------------- |
| `backend/src/main.ts`                   | 73   | NestFactory, Helmet, CORS, ValidationPipe, セッション      |
| `backend/src/app.module.ts`             | 48   | @Module imports/providers、ThrottlerModule、ScheduleModule |
| `backend/src/app.controller.ts`         | 13   | ヘルスチェック                                             |
| `backend/src/instrument.ts`             | 9    | Sentry 初期化                                              |
| `backend/src/config/config.module.ts`   | 9    | Global module パターン                                     |
| `backend/src/config/config.service.ts`  | 160  | @Injectable, 環境変数の型安全な取得                        |
| `backend/src/config/auth-constants.ts`  | 38   | JWT有効期限、bcryptラウンド数                              |
| `backend/src/config/features.config.ts` | 94   | フィーチャーフラグ設計                                     |
| `backend/src/prisma/prisma.module.ts`   | 8    | Global module + export                                     |
| `backend/src/prisma/prisma.service.ts`  | 15   | PrismaClient の DI ラッパー                                |

**合計**: ~467行

### 理解チェック

- [ ] NestJSの DI コンテナがどうモジュール間の依存を解決するか説明できるか
- [ ] `@Global()` デコレータの役割を理解しているか
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

| ファイル                                                   | 行数 | ポイント                                      |
| ---------------------------------------------------------- | ---- | --------------------------------------------- |
| `backend/src/common/common.module.ts`                      | 10   | モジュールのexport設計                        |
| `backend/src/common/services/authorization.service.ts`     | 76   | 所有権チェックの共通化                        |
| `backend/src/common/services/base-ownable.service.ts`      | 140  | **重要** 抽象基底クラス、テンプレートメソッド |
| `backend/src/common/exceptions/app.exception.ts`           | 83   | カスタム例外クラス                            |
| `backend/src/common/exceptions/error-codes.ts`             | 67   | エラーコード定義                              |
| `backend/src/common/exceptions/error-messages.ts`          | 48   | エラーメッセージマッピング                    |
| `backend/src/common/filters/throttler-exception.filter.ts` | 23   | レート制限フィルタ                            |
| `backend/src/common/guards/admin.guard.ts`                 | 22   | 管理者権限チェック                            |
| `backend/src/common/decorators/public.decorator.ts`        | 4    | @Public() デコレータ                          |
| `backend/src/common/logger/app-logger.service.ts`          | 63   | カスタムロガー                                |
| `backend/src/common/dto/pagination.dto.ts`                 | 72   | ページネーションDTO                           |
| `backend/src/common/constants/prisma-selects.ts`           | 38   | Prisma select の定数化                        |

**合計**: ~546行

### 理解チェック

- [ ] `BaseOwnableService` の抽象メソッドがどう具象クラスで実装されるか図示できるか
- [ ] `checkOwnership()` がどの層（Controller/Service）で呼ばれるか説明できるか
- [ ] AppException → HTTP レスポンスの変換フローを説明できるか
- [ ] `AdminGuard` と `JwtAuthGuard` の関係を説明できるか

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

| ファイル                                                     | 行数 | ポイント                         |
| ------------------------------------------------------------ | ---- | -------------------------------- |
| `backend/src/auth/types.ts`                                  | 32   | AuthenticatedRequest 型定義      |
| `backend/src/auth/types/oauth.types.ts`                      | 96   | OAuthプロファイル型              |
| `backend/src/auth/jwt.strategy.ts`                           | 29   | Passport JWT Strategy            |
| `backend/src/auth/jwt-auth.guard.ts`                         | 41   | @Public() を考慮したGuard        |
| `backend/src/auth/oauth-auth.guards.ts`                      | 22   | OAuth用Guard群                   |
| `backend/src/auth/google.strategy.ts`                        | 41   | Google OAuth Strategy            |
| `backend/src/auth/github.strategy.ts`                        | 40   | GitHub OAuth Strategy            |
| `backend/src/auth/line.strategy.ts`                          | 51   | LINE OAuth Strategy              |
| `backend/src/auth/apple.strategy.ts`                         | 62   | Apple Sign In Strategy           |
| `backend/src/auth/x.strategy.ts`                             | 60   | X/Twitter OAuth Strategy         |
| `backend/src/auth/validators/password-strength.validator.ts` | 118  | カスタムバリデータ               |
| `backend/src/auth/dto/login.dto.ts`                          | 9    | ログインDTO                      |
| `backend/src/auth/dto/create-user.dto.ts`                    | 31   | ユーザー作成DTO                  |
| `backend/src/auth/dto/reset-password.dto.ts`                 | 37   | パスワードリセットDTO            |
| `backend/src/auth/dto/` (OAuth登録DTO x6)                    | ~70  | 各プロバイダー用登録DTO          |
| `backend/src/auth/jwt.service.ts`                            | 28   | **JWT トークン生成・検証**       |
| `backend/src/auth/auth.service.ts`                           | 131  | **ユーザー管理・パスワード認証** |
| `backend/src/auth/oauth.service.ts`                          | 290  | **OAuth 統合処理**               |
| `backend/src/auth/auth.module.ts`                            | 70   | PassportModule, JwtModule 登録   |
| `backend/src/auth/auth.controller.ts`                        | 557  | **最重要** 全認証エンドポイント  |

**合計**: ~1,815行

### AuthService の責務分離（重要）

以前は1つの巨大な `auth.service.ts` だったが、現在は3つに分離されている:

- **`auth.service.ts`（131行）** — ユーザー管理（登録・ログイン・パスワード検証）
- **`oauth.service.ts`（290行）** — OAuth フロー全体（プロバイダー統合・招待コード付き登録）
- **`jwt.service.ts`（28行）** — JWT トークンの生成のみ

### 推奨順序

1. 型定義（types.ts, oauth.types.ts）
2. Guard（jwt-auth.guard → oauth-auth.guards）
3. Strategy（jwt → google → github → line → apple → x）
4. DTO（login → create-user → reset-password → OAuth登録DTO群）
5. バリデータ（password-strength.validator）
6. Service（jwt.service → auth.service → oauth.service）
7. Module（auth.module.ts）
8. Controller（auth.controller.ts）

### 理解チェック

- [ ] JWT トークンの生成→検証→Guard の一連の流れを図示できるか
- [ ] OAuth のリダイレクトフロー（Frontend → Backend → Provider → Callback → Frontend）を説明できるか
- [ ] `@Public()` デコレータが Guard 内でどう判定されるか説明できるか
- [ ] 招待コード付き OAuth 登録のフローを説明できるか
- [ ] AuthService / OAuthService / JwtTokenService の責務の違いを説明できるか

---

## Phase 4: CRUDモジュール群

**学ぶ技術**: NestJS（Controller, DTO, class-validator）、Prisma CRUD
**所要目安**: 5〜6時間

### 事前学習

- [NestJS公式 - Controllers](https://docs.nestjs.com/controllers)
- [class-validator README](https://github.com/typestack/class-validator)
- [Prisma - CRUD](https://www.prisma.io/docs/orm/prisma-client/queries/crud)

### 4-A: Notebook（最もシンプル、入門に最適）

| ファイル                                          | 行数 | ポイント                           |
| ------------------------------------------------- | ---- | ---------------------------------- |
| `backend/src/notebook/notebook.module.ts`         | 14   | 最小のModule構成                   |
| `backend/src/notebook/dto/create-notebook.dto.ts` | ~16  | @IsString, @IsOptional, @MaxLength |
| `backend/src/notebook/dto/update-notebook.dto.ts` | ~16  | 同上                               |
| `backend/src/notebook/notebook.service.ts`        | 70   | BaseOwnableService の具象実装      |
| `backend/src/notebook/notebook.controller.ts`     | 51   | CRUD エンドポイント5つ             |

**合計**: ~170行

### 4-B: Invitation（独立した小モジュール）

| ファイル                                              | 行数 | ポイント                       |
| ----------------------------------------------------- | ---- | ------------------------------ |
| `backend/src/invitation/invitation.module.ts`         | 14   |                                |
| `backend/src/invitation/dto/create-invitation.dto.ts` | 12   |                                |
| `backend/src/invitation/dto/verify-invitation.dto.ts` | 7    |                                |
| `backend/src/invitation/invitation.service.ts`        | 97   | コード生成、有効期限、使用回数 |
| `backend/src/invitation/invitation.controller.ts`     | 55   | 管理者用エンドポイント含む     |

**合計**: ~185行

### 4-C: Memo（検索・ページネーション・ゴミ箱付き）

| ファイル                                    | 行数 | ポイント                                          |
| ------------------------------------------- | ---- | ------------------------------------------------- |
| `backend/src/memo/memo.module.ts`           | 14   |                                                   |
| `backend/src/memo/dto/create-memo.dto.ts`   | 15   |                                                   |
| `backend/src/memo/dto/update-memo.dto.ts`   | 16   |                                                   |
| `backend/src/memo/dto/search-memo.dto.ts`   | 7    | 検索クエリDTO                                     |
| `backend/src/memo/memo.service.ts`          | 317  | 検索、タグフィルタ、ページネーション、soft delete |
| `backend/src/memo/memo.controller.ts`       | 146  | ゴミ箱操作含む                                    |
| `backend/src/memo/trash-cleanup.service.ts` | 30   | 30日経過メモの自動削除（@Cron）                   |

**合計**: ~545行

### 4-D: Tag（多対多リレーション）

| ファイル                                 | 行数 | ポイント                   |
| ---------------------------------------- | ---- | -------------------------- |
| `backend/src/tag/tag.module.ts`          | 14   |                            |
| `backend/src/tag/dto/create-tag.dto.ts`  | 14   |                            |
| `backend/src/tag/dto/update-tag.dto.ts`  | 15   |                            |
| `backend/src/tag/dto/search-tag.dto.ts`  | 7    |                            |
| `backend/src/tag/dto/assign-tags.dto.ts` | 7    | タグ割当DTO（特徴的）      |
| `backend/src/tag/tag.service.ts`         | 210  | Memo/Notebook へのタグ割当 |
| `backend/src/tag/tag.controller.ts`      | 87   |                            |

**合計**: ~354行

### 4-E: Theme（最も複雑なCRUD）

| ファイル                                      | 行数 | ポイント                            |
| --------------------------------------------- | ---- | ----------------------------------- |
| `backend/src/theme/theme.module.ts`           | 13   |                                     |
| `backend/src/theme/dto/create-theme.dto.ts`   | 32   |                                     |
| `backend/src/theme/dto/update-theme.dto.ts`   | 32   |                                     |
| `backend/src/theme/dto/search-theme.dto.ts`   | 28   | フィルタが豊富                      |
| `backend/src/theme/dto/favorite-theme.dto.ts` | 7    | お気に入りトグル                    |
| `backend/src/types/theme.types.ts`            | 135  | スタイル定義の型                    |
| `backend/src/theme/theme.service.ts`          | 413  | アクセス制御、公開/非公開、カテゴリ |
| `backend/src/theme/theme.controller.ts`       | 152  | お気に入りトグル含む                |

**合計**: ~812行

### 推奨順序: Notebook → Invitation → Memo → Tag → Theme

### 理解チェック

- [ ] `BaseOwnableService` を継承した具象サービスの実装パターンを説明できるか
- [ ] Prisma の `include` と `select` の使い分けを理解しているか
- [ ] N:N リレーション（MemoTag）の作成・削除パターンを説明できるか
- [ ] Theme のアクセス制御（system/public/private）を図示できるか
- [ ] `trash-cleanup.service.ts` の @Cron による自動削除の仕組みを説明できるか

---

### ★ 中間テスト実施ポイント（Phase 4 完了後）

ここまでがバックエンド全体。中間テストで理解度を再測定してから Frontend に進む。

---

## Phase 5: Frontend 型定義・定数・ユーティリティ

**学ぶ技術**: TypeScript（型設計）、環境変数管理
**所要目安**: 4〜5時間

### 事前学習

- TypeScript: interface vs type、ジェネリクス
- Vite の環境変数（`import.meta.env`）

### 写経対象

| ファイル                                  | 行数 | ポイント                                   |
| ----------------------------------------- | ---- | ------------------------------------------ |
| `frontend/src/types/enums.ts`             | 31   | ViewType, ObjectType                       |
| `frontend/src/types/memo.ts`              | 36   | バックエンドとの型の対応                   |
| `frontend/src/types/tag.ts`               | 33   |                                            |
| `frontend/src/types/notebook.ts`          | 23   |                                            |
| `frontend/src/types/theme.ts`             | 152  | 最も複雑な型定義                           |
| `frontend/src/types/pagination.ts`        | 35   | ジェネリクス `PaginatedResult<T>`          |
| `frontend/src/types/invitation.ts`        | 26   |                                            |
| `frontend/src/constants/queryKeys.ts`     | 50   | React Query キーファクトリ                 |
| `frontend/src/constants/cacheConfig.ts`   | 108  | staleTime/gcTime設計                       |
| `frontend/src/constants/features.ts`      | 100  | フィーチャーフラグ                         |
| `frontend/src/utils/env.ts`               | 153  | VITE\_環境変数の型安全な取得               |
| `frontend/src/utils/logger.ts`            | 76   | 開発時のみログ出力                         |
| `frontend/src/utils/passwordValidator.ts` | 156  | バックエンドと同じルールをクライアントでも |

**合計**: ~979行

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

| ファイル                                        | 行数 | ポイント                                 |
| ----------------------------------------------- | ---- | ---------------------------------------- |
| `frontend/src/utils/auth.ts`                    | 294  | AuthTokenManager, AuthAPI, UserProfile型 |
| `frontend/src/utils/oauthAuth/BaseOAuthAuth.ts` | 89   | OAuth基底クラス                          |
| `frontend/src/utils/oauthAuth.ts`               | 122  | Google/GitHub/LINE/Apple/X の具象クラス  |
| `frontend/src/utils/api.ts`                     | 432  | **最重要** 全APIエンドポイントの集約     |

**合計**: ~937行

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

| ファイル                                     | 行数 | ポイント                              |
| -------------------------------------------- | ---- | ------------------------------------- |
| `frontend/src/stores/useViewStore.ts`        | 109  | UI状態マシン（ObjectType × ViewType） |
| `frontend/src/stores/useMemoDataStore.ts`    | 21   | 編集中メモの ID 管理                  |
| `frontend/src/stores/useTagStore.ts`         | 95   | タグフィルタリングロジック            |
| `frontend/src/stores/usePaletteStore.ts`     | 34   | パレットモーダル状態                  |
| `frontend/src/stores/useEditorFocusStore.ts` | 11   | エディタフォーカス制御                |

**合計**: ~270行

> **注**: 以前あった `useMemoStore.ts`（Facade パターン）は削除済み。各ストアを直接使う方針に変更された。

### 7-B: React Context（認証）

| ファイル                                | 行数 | ポイント                       |
| --------------------------------------- | ---- | ------------------------------ |
| `frontend/src/contexts/AuthContext.tsx` | 277  | Provider + useContext パターン |

### 7-C: React Query Hooks

| ファイル                                   | 行数 | ポイント                         |
| ------------------------------------------ | ---- | -------------------------------- |
| `frontend/src/hooks/useNotebookQueries.ts` | 54   | 最もシンプルな Query/Mutation    |
| `frontend/src/hooks/useTagQueries.ts`      | 90   | assignTags のキャッシュ無効化    |
| `frontend/src/hooks/useMemoQueries.ts`     | 170  | タグフィルタ付き検索、ゴミ箱操作 |
| `frontend/src/hooks/useThemeQueries.ts`    | 232  | 複雑なフィルタ・お気に入り       |

### 7-D: 認証 Hooks

| ファイル                             | 行数 | ポイント               |
| ------------------------------------ | ---- | ---------------------- |
| `frontend/src/hooks/useAuth.ts`      | 124  | AuthContext のラッパー |
| `frontend/src/hooks/useEmailAuth.ts` | 98   | メール認証ロジック     |
| `frontend/src/hooks/useOAuth.ts`     | 188  | OAuthフロー制御        |

### 7-E: ユーティリティ Hooks

| ファイル                                     | 行数 | ポイント                       |
| -------------------------------------------- | ---- | ------------------------------ |
| `frontend/src/hooks/useWindowSize.ts`        | 31   | resize イベント                |
| `frontend/src/hooks/useAppInit.ts`           | 16   | 初期データロード               |
| `frontend/src/hooks/useAutoSave.ts`          | 109  | **重要** 2秒デバウンス自動保存 |
| `frontend/src/hooks/useNavigation.ts`        | 74   | 複合ナビゲーションアクション   |
| `frontend/src/hooks/useThemeCSS.ts`          | 65   | 動的CSS読み込み                |
| `frontend/src/hooks/useActiveTheme.ts`       | 16   | アクティブテーマの取得         |
| `frontend/src/hooks/useMemoPalette.ts`       | 45   | キーボードショートカット       |
| `frontend/src/hooks/useReducedMotion.ts`     | 23   | アニメーション抑制（a11y）     |
| `frontend/src/hooks/useMoriEffectControl.ts` | 71   | mori テーマエフェクトの制御    |

**Phase 7 合計**: ~1,487行

### 推奨順序

1. Zustand stores（useViewStore → usePaletteStore → useEditorFocusStore → useMemoDataStore → useTagStore）
2. React Query hooks（useNotebookQueries → useTagQueries → useMemoQueries → useThemeQueries）
3. 認証（useEmailAuth → useOAuth → AuthContext → useAuth）
4. ユーティリティhooks（useAutoSave → useNavigation → 残り）

### 理解チェック

- [ ] Zustand と React Query の責務の違いを説明できるか（クライアント状態 vs サーバー状態）
- [ ] useMutation の onSuccess でキャッシュ無効化するパターンを説明できるか
- [ ] AuthContext が Provider パターンでどう全コンポーネントに認証状態を配信するか説明できるか
- [ ] useAutoSave の状態遷移（idle → pending → saving → saved → idle）を説明できるか

---

## Phase 8: Frontend コンポーネント

**学ぶ技術**: React 19、TipTap、Tailwind CSS、レスポンシブ設計
**所要目安**: 8〜10時間

### 事前学習

- [TipTap公式 - Getting Started](https://tiptap.dev/docs/editor/getting-started)
- [Tailwind CSS - Utility-First](https://tailwindcss.com/docs/utility-first)

### 8-A: エントリポイント・レイアウト

| ファイル                                            | 行数 | ポイント                              |
| --------------------------------------------------- | ---- | ------------------------------------- |
| `frontend/src/main.tsx`                             | 29   | React 19 の createRoot                |
| `frontend/src/App.tsx`                              | 74   | QueryClient設定、Router、Provider階層 |
| `frontend/src/components/layouts/DesktopLayout.tsx` | 144  | ビュー状態マシンの実体化              |
| `frontend/src/components/layouts/MobileLayout.tsx`  | 123  | レスポンシブ版                        |

**合計**: ~370行

### 8-B: 認証コンポーネント

| ファイル                                               | 行数 | ポイント                   |
| ------------------------------------------------------ | ---- | -------------------------- |
| `frontend/src/components/auth/AuthGuard.tsx`           | 24   | 認証必須ラッパー           |
| `frontend/src/components/auth/AuthCallback.tsx`        | 17   | OAuthリダイレクト処理      |
| `frontend/src/components/auth/AuthForm.tsx`            | 254  | ログイン/登録フォーム      |
| `frontend/src/components/auth/EmailAuthForm.tsx`       | 170  | メール認証フォーム         |
| `frontend/src/components/auth/LoginPageLayout.tsx`     | 24   | ログインページのレイアウト |
| `frontend/src/components/auth/OAuthInviteForm.tsx`     | 98   | 招待コード + OAuth         |
| `frontend/src/components/auth/OAuthWithInviteForm.tsx` | 118  | 招待コード付きOAuth登録    |
| `frontend/src/components/auth/PasswordReset.tsx`       | 112  | パスワードリセット画面     |
| `frontend/src/components/auth/PasswordResetForm.tsx`   | 88   | リセットフォーム           |

**合計**: ~905行

### 8-C: メモコンポーネント

| ファイル                                       | 行数 | ポイント                                    |
| ---------------------------------------------- | ---- | ------------------------------------------- |
| `frontend/src/components/memo/MemoItem.tsx`    | 61   | 単一メモの表示                              |
| `frontend/src/components/memo/MemoList.tsx`    | 65   | リスト描画、タグフィルタ                    |
| `frontend/src/components/memo/MemoSearch.tsx`  | 69   | デバウンス付き検索                          |
| `frontend/src/components/memo/MemoEditor.tsx`  | 325  | **複雑** TipTap統合、タグ・ノートブック割当 |
| `frontend/src/components/memo/MemoPalette.tsx` | 373  | **複雑** キーボードナビゲーション           |
| `frontend/src/components/memo/TrashView.tsx`   | 103  | ゴミ箱画面（復元・完全削除）                |

**合計**: ~996行

### 8-D: タグコンポーネント

| ファイル                                          | 行数 | ポイント           |
| ------------------------------------------------- | ---- | ------------------ |
| `frontend/src/components/tag/TagChip.tsx`         | 50   | 最小コンポーネント |
| `frontend/src/components/tag/TagFilter.tsx`       | 59   | フィルタトグル     |
| `frontend/src/components/tag/TagDropdownIcon.tsx` | 79   | ドロップダウン     |
| `frontend/src/components/tag/TagSelector.tsx`     | 134  | マルチセレクト     |
| `frontend/src/components/tag/TagForm.tsx`         | 145  | 作成/編集フォーム  |
| `frontend/src/components/tag/TagManager.tsx`      | 193  | タグ管理画面       |

**合計**: ~660行

### 8-E: ノートブック・エディタ・UI・管理

| ファイル                                              | 行数 | ポイント              |
| ----------------------------------------------------- | ---- | --------------------- |
| `frontend/src/components/notebook/NotebookList.tsx`   | 135  |                       |
| `frontend/src/components/notebook/NotebookEditor.tsx` | 227  | テーマ選択、タグ割当  |
| `frontend/src/components/editor/RichTextEditor.tsx`   | 193  | TipTap ラッパー       |
| `frontend/src/components/editor/SlashCommandList.tsx` | 107  | スラッシュコマンドUI  |
| `frontend/src/components/editor/suggestion.ts`        | 143  | TipTap suggestion設定 |
| `frontend/src/components/ui/Header.tsx`               | 159  | ナビゲーションバー    |
| `frontend/src/components/ui/OAuthLoginButton.tsx`     | 164  | OAuth ボタン          |
| `frontend/src/components/ui/PasswordInput.tsx`        | 147  | パスワード入力        |
| `frontend/src/components/admin/InvitationManager.tsx` | 229  | 管理者画面            |

**合計**: ~1,504行

### 推奨順序

1. エントリ（main.tsx → App.tsx → Layouts）
2. UI部品（Header → PasswordInput → OAuthLoginButton）
3. 認証（AuthGuard → AuthCallback → LoginPageLayout → AuthForm → 残り）
4. タグ（TagChip → TagFilter → TagSelector → TagForm → TagManager）
5. メモ（MemoItem → MemoList → MemoSearch → TrashView → MemoEditor → MemoPalette）
6. ノートブック（NotebookList → NotebookEditor）
7. エディタ（RichTextEditor → SlashCommandList → suggestion）
8. 管理（InvitationManager）

---

## Phase 9: テーマシステム・エフェクト

**学ぶ技術**: CSS Variables、動的スタイル適用、Canvas アニメーション
**所要目安**: 4〜5時間

### 9-A: テーマユーティリティ

| ファイル                             | 行数 | ポイント                |
| ------------------------------------ | ---- | ----------------------- |
| `frontend/src/utils/themeUtils.ts`   | 298  | CSS変数抽出・マージ     |
| `frontend/src/utils/themeLoader.ts`  | 122  | 動的CSSファイル読み込み |
| `frontend/src/utils/themeApplier.ts` | 197  | DOMへのテーマ適用       |

### 9-B: テーマ CSS（7テーマ）

| ファイル                               | 行数 | ポイント                   |
| -------------------------------------- | ---- | -------------------------- |
| `frontend/public/themes/siro/siro.css` | 201  | 白基調（デフォルト）       |
| `frontend/public/themes/kuro/kuro.css` | 201  | ダーク                     |
| `frontend/public/themes/aka/aka.css`   | 201  | 赤系                       |
| `frontend/public/themes/ao/ao.css`     | 201  | 青系                       |
| `frontend/public/themes/kami/kami.css` | 202  | 紙質感                     |
| `frontend/public/themes/code/code.css` | 204  | コードエディタ風           |
| `frontend/public/themes/mori/mori.css` | 329  | 森テーマ（エフェクト付き） |

### 9-C: エフェクトシステム

| ファイル                                                   | 行数 | ポイント                          |
| ---------------------------------------------------------- | ---- | --------------------------------- |
| `frontend/src/themes/themeEffectRegistry.ts`               | 13   | エフェクト登録レジストリ          |
| `frontend/src/components/effects/ThemeEffectHost.tsx`      | 60   | エフェクトのホストコンポーネント  |
| `frontend/src/components/effects/ParticleCanvas.tsx`       | 162  | Canvas パーティクルアニメーション |
| `frontend/src/components/effects/ForestAnimationLayer.tsx` | 97   | 森のアニメーションレイヤー        |
| `frontend/src/components/effects/mori/MoriEffectLayer.tsx` | 25   | mori テーマ専用エフェクト         |

**Phase 9 合計**: ~1,513行

### 理解チェック

- [ ] テーマ CSS が DOM に適用されるまでの流れを説明できるか
- [ ] CSS 変数（`--color-primary` 等）がコンポーネントでどう参照されるか理解しているか
- [ ] themeEffectRegistry でエフェクトがどう登録・呼び出されるか説明できるか

---

## Phase 10: 設定ファイル・インフラ

**学ぶ技術**: Vite、Docker Compose、Tailwind CSS設定、ESLint
**所要目安**: 2〜3時間

### 写経対象

| ファイル                      | 行数 | ポイント               |
| ----------------------------- | ---- | ---------------------- |
| `frontend/vite.config.ts`     | ~75  | PWA設定、HMR           |
| `frontend/tailwind.config.js` | ~30  | Tailwindカスタマイズ   |
| `frontend/vitest.config.ts`   | ~15  | テスト設定             |
| `docker-compose.yml`          | ~68  | マルチサービス構成     |
| `nginx/` 設定ファイル         | ~30  | リバースプロキシ       |
| `eslint.common.mjs`           | ~30  | 共通Lint設定           |
| 各 `tsconfig.json`            | ~100 | TypeScript設定の関係性 |

**合計**: ~350行

---

## Phase 11: End-to-End フロー確認

**所要目安**: 3〜4時間

写経完了後、以下のフローをコードを追いながら手で図示する:

### フロー1: メモ作成

```
ボタン押下 → goToMemoCreate() → ViewStore更新 → Layout再描画
→ MemoEditor表示 → タイトル入力 → useAutoSave.scheduleAutoSave()
→ 2秒後 → useCreateMemo() → api.createMemo() → fetch POST /memos
→ Backend: JwtAuthGuard → MemoController.create() → MemoService.create()
→ Prisma INSERT → レスポンス → onSuccess → invalidateQueries
→ useMemos() 再取得 → MemoList 再描画
```

### フロー2: OAuth ログイン

```
OAuthLoginButton押下 → GoogleAuthUtils.startLogin()
→ window.location.href = /auth/google
→ Backend: GoogleStrategy → Google認証画面
→ コールバック → AuthController → OAuthService → JWT生成
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

### フロー4: テーマ切り替え

```
テーマ選択 → useThemeCSS(theme.cssFilePath)
→ themeLoader.loadCSS() → fetch でCSSファイル取得
→ themeUtils で CSS変数を抽出
→ themeApplier で document.documentElement.style に適用
→ themeEffectRegistry チェック → エフェクトがあれば ThemeEffectHost 表示
→ 画面の色・雰囲気が変わる
```

---

## 全体サマリ

| Phase    | 対象                    | 行数目安    | 学ぶ技術                             |
| -------- | ----------------------- | ----------- | ------------------------------------ |
| 0        | データモデル            | 166         | Prisma Schema                        |
| 1        | Backend設定・起動       | 467         | NestJS Module/DI                     |
| 2        | 共通基盤                | 546         | Guard, Filter, テンプレートメソッド  |
| 3        | 認証モジュール          | 1,815       | Passport, JWT, OAuth, bcrypt         |
| 4        | CRUDモジュール群        | 1,955       | NestJS CRUD, Prisma, class-validator |
| 5        | Frontend 型・定数・util | 979         | TypeScript型設計                     |
| 6        | API・認証util           | 937         | fetch, localStorage, トークン管理    |
| 7        | 状態管理                | 1,487       | Zustand, React Query, Context        |
| 8        | コンポーネント          | 4,435       | React, TipTap, Tailwind              |
| 9        | テーマ・エフェクト      | 1,513       | CSS Variables, Canvas, 動的スタイル  |
| 10       | 設定・インフラ          | 350         | Vite, Docker, ESLint                 |
| 11       | E2Eフロー確認           | —           | アーキテクチャ統合理解               |
| **合計** |                         | **~14,650** |                                      |
