# Gap Analysis: viral-invitation

## 1. Current State Investigation

### 既存ドメイン資産

#### バックエンド（NestJS）

| 資産                                                   | 場所                                                   | 状況                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `InvitationService`                                    | `backend/src/invitation/invitation.service.ts`         | コード発行・検証・消費・削除を実装済み                                                     |
| `InvitationController`                                 | `backend/src/invitation/invitation.controller.ts`      | `POST/GET/DELETE /invitation`、`POST /invitation/verify` を実装済み（作成系は ADMIN 限定） |
| `InvitationCode` モデル                                | `backend/prisma/schema.prisma:23-35`                   | `code @db.VarChar(50)`, `maxUses`, `usedCount`, `expiresAt`, `createdById`                 |
| `User` モデル                                          | `backend/prisma/schema.prisma:136-161`                 | `invitationCodes: InvitationCode[]` 関係あり。`invitationQuota` は **未定義**              |
| `User.emailVerified` / `User.emailVerificationToken`   | `backend/prisma/schema.prisma:143-144`                 | スキーマには既に存在。送信・確認フローは未実装                                             |
| `AuthService.register()`                               | `backend/src/auth/auth.service.ts:69-116`              | 招待コードは `invitationCode?: string`（DTOで必須化）                                      |
| `OAuthService.handleOAuthLogin()`                      | `backend/src/auth/oauth.service.ts:60-95`              | 新規ユーザーは `INVITATION_REQUIRED` を throw                                              |
| `OAuthService.handleOAuthRegistrationWithInvitation()` | `backend/src/auth/oauth.service.ts:100-146`            | 5プロバイダ共通の招待コード付き登録ロジック                                                |
| `AuthorizationService`                                 | `backend/src/common/services/authorization.service.ts` | 所有権チェック一元化。`validateOwnership` / `validateExistence` / `validateBulkOwnership`  |
| `ERROR_CODES.INVITATION`                               | `backend/src/common/exceptions/error-codes.ts:64-70`   | `INVALID_CODE`/`EXPIRED`/`MAX_USES_REACHED`/`NOT_FOUND` の4種。`QUOTA_EXHAUSTED` は未定義  |
| `ConfigService.generateInvitationRequiredUrl()`        | `backend/src/config/config.service.ts:219-221`         | フロントへのリダイレクトURL生成（旧フロー）                                                |
| Sentry `feature_area: invitation`                      | `backend/src/common/sentry/sentry-tags.ts:7,34-35`     | URL prefix `/invitation`, `/invitations` で自動付与済み                                    |
| Passport strategies（Google/GitHub/LINE/Apple/X）      | `backend/src/auth/{provider}.strategy.ts`              | いずれも `state` パラメータの明示利用なし                                                  |

#### フロントエンド（React + Vite）

| 資産                                                   | 場所                                                  | 状況                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AuthForm` / `EmailAuthForm` / `OAuthInviteForm`       | `frontend/src/components/auth/*.tsx`                  | 招待コード手入力フォーム。エラー分岐は `?error=invitation_required`                    |
| `InvitationManager`                                    | `frontend/src/components/admin/InvitationManager.tsx` | ADMIN 専用招待コード管理画面。**コードクリップボードコピーのみ**でURL共有なし          |
| `SettingsPage`                                         | `frontend/src/components/settings/SettingsPage.tsx`   | 現在は DebugPanel のみ。招待UIなし                                                     |
| `apiClient`                                            | `frontend/src/utils/api.ts:296-320`                   | `verifyInvitationCode`/`getInvitations`/`createInvitation`/`deleteInvitation` 実装済み |
| `useOAuth`                                             | `frontend/src/hooks/useOAuth.ts`                      | sessionStorage で `pending{Provider}User` を保持して招待コード付き登録に繋ぐ           |
| App ルーティング                                       | `frontend/src/App.tsx:60-87`                          | `/invite/:code` ルートは **未定義**                                                    |
| `InvitationCode` / `InvitationVerificationResponse` 型 | `frontend/src/types/invitation.ts`                    | 招待者情報を含まない。レスポンス型に `code`/`maxUses`/`currentUses` のみ               |

### 既存パターン・規約

- **バックエンド**: ドメインモジュール（`backend/src/{domain}/`）。controller/service/dto 分離。所有権チェックは `AuthorizationService` 一元化
- **フロントエンド**: サーバ状態は React Query（`hooks/use{Domain}Queries.ts`）、UI状態は Zustand。API は `apiClient` 経由のみ
- **認証**: グローバル JWT Guard + `@Public()` opt-out
- **エラーハンドリング**: `ERROR_CODES` 体系 + `throwBadRequest/Unauthorized/Forbidden/NotFound` ヘルパー
- **Sentry**: `feature_area` enum に `invitation` 既存。URL prefix 自動付与

### 統合面

- DB: PostgreSQL（Supabase 本番 / Docker ローカル）。Prisma migrate 必須
- API: `apiClient` 経由で型付き fetch
- OAuth: Passport（5プロバイダ）。state パラメータは passport の `state: true` または `passReqToCallback` で扱える
- フロントルーティング: react-router v7（`BrowserRouter`）

---

## 2. Requirements Feasibility Analysis

### Requirement → Asset Map

| Req | 必要なケイパビリティ                          | 既存資産                                                                                                                     | ギャップ                                                                                                                                                                  |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/invite/:code` 公開ルート + prefill 登録画面 | App.tsx ルーティング                                                                                                         | **Missing**: ルート未定義、prefill 状態の受け渡し、招待者表示 UI                                                                                                          |
| 1   | 認証済みユーザーのリダイレクト                | `AuthGuard`                                                                                                                  | **Constraint**: 逆方向（認証済み → ホーム）のガード未実装                                                                                                                 |
| 2   | 短い招待コード（nanoid 8〜10文字）            | `randomBytes(16).toString('hex').toUpperCase()` で32文字hex                                                                  | **Missing**: nanoid 依存追加。文字集合カスタマイズ（紛らわしい文字除外）                                                                                                  |
| 2   | 既存32文字hexコードの後方互換                 | `InvitationCode.code @db.VarChar(50)`                                                                                        | **Constraint**: schema は両形式を許容。検証ロジックは長さ非依存                                                                                                           |
| 2   | 入力欄の autoCapitalize 等                    | `OAuthInviteForm.tsx:78-86` / `EmailAuthForm.tsx:112-120`                                                                    | **Missing**: 属性未設定                                                                                                                                                   |
| 2   | 共有用絶対URL レスポンス                      | `ConfigService.frontendUrl`                                                                                                  | **Missing**: 招待作成APIのレスポンスにURLフィールド追加                                                                                                                   |
| 3   | OAuth開始前のコード検証                       | `apiClient.verifyInvitationCode()` 既存                                                                                      | **Missing**: フロント側でOAuthボタン押下時に検証 → state引き継ぎ                                                                                                          |
| 3   | OAuth state パラメータでコード引き継ぎ        | Passport strategy（state未利用）                                                                                             | **Research Needed**: passport-google-oauth20 / passport-github2 / passport-line-auth / passport-apple / passport-twitter-oauth2 で state を扱う統一手段。CSRF対策との両立 |
| 3   | コールバックでコード再検証 + 消費             | `OAuthService.handleOAuthRegistrationWithInvitation()`                                                                       | **Constraint**: 既存ロジックは流用可。OAuth callback フローへ統合する必要あり                                                                                             |
| 3   | 旧フロー（OAuth後の招待入力）の廃止           | `OAuthService.handleOAuthLogin():84` `INVITATION_REQUIRED` throw / `OAuthInviteForm.tsx` / `generateInvitationRequiredUrl()` | **Decision Needed**: 完全廃止 vs 後方互換維持。旧UI/エンドポイント `/auth/{provider}/register-with-invitation` 5本の扱い                                                  |
| 4   | `User.invitationQuota` 追加                   | -                                                                                                                            | **Missing**: Prismaマイグレーション。初期値・既存ユーザーへの付与戦略                                                                                                     |
| 4   | 一般ユーザーの招待コード発行 API              | `InvitationController.createInvitation()` は `AdminGuard`                                                                    | **Missing**: 一般ユーザー向け発行エンドポイント or 既存の `AdminGuard` 撤去 + quota チェック追加                                                                          |
| 4   | 自分の招待一覧取得 API                        | `InvitationService.getInvitations(createdById)` 既存                                                                         | **Missing**: 一般ユーザー向けエンドポイント（現状 `GET /invitation` は ADMIN 限定）                                                                                       |
| 4   | ADMIN 無制限挙動                              | `AdminGuard`                                                                                                                 | **Constraint**: quota チェックの分岐に role 判定が必要                                                                                                                    |
| 5   | Settings画面の友達招待UI                      | `SettingsPage.tsx`                                                                                                           | **Missing**: 「友達を招待」セクション全体                                                                                                                                 |
| 5   | Web Share API + クリップボードフォールバック  | `navigator.clipboard.writeText` は既存（InvitationManager内）                                                                | **Missing**: `navigator.share` 利用と feature detection                                                                                                                   |
| 5   | quota残数表示・発行済み一覧                   | -                                                                                                                            | **Missing**: React Query フック `useInvitationQuota` / `useMyInvitations` 等                                                                                              |
| 6   | 招待者の文脈表示                              | `InvitationCode.createdById → User` リレーション既存                                                                         | **Missing**: 検証 API レスポンス拡張（`creatorName` 等）+ PII除外                                                                                                         |
| 6   | PIIポリシー（email等を返さない）              | Sentry スクラバ規約あり（steering tech.md）                                                                                  | **Constraint**: API レスポンス設計時に遵守                                                                                                                                |
| 7   | エラーコード `QUOTA_EXHAUSTED` 追加           | `ERROR_CODES.INVITATION` 既存                                                                                                | **Missing**: 新エラーコード定数とメッセージ                                                                                                                               |
| 7   | フロントの構造化エラー判定                    | `auth.controller.ts:118` `errorMessage.includes('invitation code')`                                                          | **Missing**: バックがエラーコードを HTTP レスポンスに乗せる仕組みは既存（要確認）。フロントで `code` フィールドを参照する分岐                                             |
| 8   | 登録成功後の自動ログインと文言整合            | `registerWithTokens()` で自動ログイン済み / `EmailAuthForm.tsx:37` 文言誤                                                    | **Missing**: 文言修正 + 遷移先決定（ホーム or オンボーディング）                                                                                                          |
| 9   | 管理者メール例外維持                          | `ConfigService.isAdminEmail()` + `auth.service.ts:84-96` / `oauth.service.ts:72-82`                                          | **Constraint**: 既存テスト含め新フローでも保持                                                                                                                            |
| 9   | 5プロバイダ全部に新フロー適用                 | 5 strategy + 5 register-with-invitation エンドポイント                                                                       | **Constraint**: 横展開が必要。Apple は `fallbackEmail` パラメータあり                                                                                                     |
| 9   | 通常/キャンペーンコード区別維持               | `CreateInvitationDto.maxUses` 既存                                                                                           | **Constraint**: quota 発行は `maxUses=1` 固定で「通常コード」扱い                                                                                                         |

### 非機能要件

- **セキュリティ**: OAuth state CSRF（PKCE代替手段）。招待コード推測難易度（nanoid 8文字 + URLセーフ ≈ 47.6 bit entropy で十分）
- **パフォーマンス**: 影響軽微。検証クエリ追加のみ
- **可観測性**: Sentry `feature_area: invitation` 既存活用
- **アクセシビリティ**: 入力属性（autoCapitalize/inputMode）、ボタンの focus 順序

### 複雑度シグナル

- 単純 CRUD（招待コード生成・quota 管理）
- 外部統合（OAuth state 引き継ぎ）→ **要研究**
- 既存フロー廃止に伴う後方互換判断 → **要決定**
- マイグレーション戦略（既存ユーザーへの初期 quota 付与）→ **要決定**

---

## 3. Implementation Approach Options

### Option A: 既存コンポーネントを最大限拡張

**スコープ**:

- `InvitationService` に quota 関連メソッド追加（`createForUser` / `getMyInvitations` / `getMyQuota`）
- `InvitationController` のガードを `AdminGuard` から動的判定（一般ユーザーは quota 経由・ADMIN は無制限）に切り替え
- `OAuthService.handleOAuthLogin()` に「state にコードが入っていれば即時登録」分岐を追加
- フロントは `AuthForm` を拡張して `/invite/:code` のクエリ受け取りを追加

**互換性**: 旧 `/auth/{provider}/register-with-invitation` エンドポイント 5本を残すと API 表面が肥大。  
**複雑性**: ファイル数最小だが、`InvitationController` と `OAuthService` の責務がさらに肥大化。

**Trade-offs**:

- ✅ 新規ファイル最小・既存パターンに収まる
- ✅ マイグレーション1回で済む
- ❌ `OAuthService` がさらに巨大化（既に複数プロバイダ対応で肥大気味）
- ❌ 「旧フロー残存 vs 新フロー」の分岐がコード中に常駐する

### Option B: 新規モジュール/コンポーネントで責務分離

**スコープ**:

- 新規 `InvitationFlowService`（OAuth state 引き継ぎ・コールバック統合を集約）
- 新規 `InvitationQuotaService`（quota 操作を独立）
- フロントに新規 `/invite/:code` 専用ページコンポーネント（`pages/InvitePage.tsx`）+ `useInviteFlow` hook
- 新規 `useInvitationsQueries.ts`（React Query フック）
- 旧 OAuth コールバック分岐は `@deprecated` で別途除去

**互換性**: 旧エンドポイントは別 PR で段階的に除去できる。  
**複雑性**: ファイル数増加。サービス間の責務境界の設計が必要。

**Trade-offs**:

- ✅ 単一責務原則を維持。テスト容易
- ✅ `OAuthService` / `InvitationService` の肥大化を防止
- ✅ steering（ドメイン駆動、責務別ディレクトリ）と整合
- ❌ 設計時間が増える
- ❌ ファイル間の整合（コード規約・命名）に注意必要

### Option C: ハイブリッド（推奨）

**スコープ**:

- **既存拡張**: `InvitationService`（quota メソッド追加）、`InvitationController`（一般ユーザー用エンドポイント追加）、`User` model（`invitationQuota` 追加）
- **新規分離**: フロントは `pages/InvitePage.tsx`（`/invite/:code` 専用）+ `hooks/useInvitationsQueries.ts`（React Query 集約）+ Settings画面に新規 `InvitationCard` コンポーネント
- **OAuth フロー**: `OAuthService` に state 引き継ぎ対応を最小限追加。旧 `/auth/{provider}/register-with-invitation` 5本は **削除**（Requirement 3-6 「廃止または無効化」を採用）し、新フロー単一化
- **段階的展開**: マイグレーション → 新エンドポイント追加 → フロント UI 追加 → 旧 UI 削除、の順で各タスクをコミット分離

**Trade-offs**:

- ✅ バックは既存ドメインモジュール内で完結、フロントは新規ページで責務クリア
- ✅ steering（ドメインモジュール 1:1）に整合
- ✅ OAuth フロー単一化で長期保守性◎
- ⚠️ 旧フロー削除に伴う既存テスト書き換えが発生（auth.controller.spec.ts に 5プロバイダ分）

---

## 4. Implementation Complexity & Risk

| 項目                                          | Effort              | Risk       | 根拠                                                                 |
| --------------------------------------------- | ------------------- | ---------- | -------------------------------------------------------------------- |
| Req 1: `/invite/:code` ルート + prefill       | S                   | Low        | react-router 既存パターン、prefill は URL params 経由で素直          |
| Req 2: nanoid 化 + 後方互換                   | S                   | Low        | 依存追加と関数差し替えのみ。検証ロジックは長さ非依存                 |
| Req 3: OAuth 順序逆転（state 引き継ぎ）       | M                   | **Medium** | 5プロバイダ × passport ライブラリ差異。state CSRF/署名検証の設計必要 |
| Req 4: invitationQuota + 一般ユーザー発行 API | M                   | Low        | マイグレーション + ガード変更 + quota 減算ロジック                   |
| Req 5: Settings 友達招待UI + Web Share API    | M                   | Low        | 新規コンポーネント。Web Share API は feature detection で安全        |
| Req 6: 招待者表示                             | S                   | Low        | API レスポンス拡張 + UI 文言追加                                     |
| Req 7: 構造化エラーコード                     | S                   | Low        | 既存 `ERROR_CODES` 体系に1件追加 + フロント分岐差し替え              |
| Req 8: 自動ログイン文言整合                   | S                   | Low        | 文言修正 + 遷移ロジック微調整                                        |
| Req 9: 既存フロー整合                         | S                   | Low        | 管理者例外維持、5プロバイダ横展開のメカニカルな作業                  |
| **合計**                                      | **M〜L (5〜8人日)** | **Medium** | OAuth state 引き継ぎが唯一の中リスク要素                             |

---

## 5. Research Needed（設計フェーズへ持ち越し）

設計フェーズで深掘りする項目を簡潔にリストアップ：

1. **OAuth state パラメータの統一実装方法**: 5プロバイダ全てで安全に招待コードを引き継ぐ方式
   - 候補A: passport の `state: true` オプション（Google/GitHub）+ プロバイダ別フォールバック
   - 候補B: サーバ側セッション（コード一時保存）+ 短い nonce のみ state に乗せる
   - 候補C: 署名付き JWT を state にエンコード
   - 評価軸: CSRF 耐性 / プロバイダ間統一性 / 既存セッションレス設計との整合
2. **nanoid 文字集合**: URL セーフ・大文字小文字混在・紛らわしい文字除外の具体 alphabet
3. **`invitationQuota` デフォルト値と既存ユーザー初期付与**: 3?5?10?。マイグレーションで一律 vs ロール別
4. **既存 32文字hex コードの扱い**: 後方互換維持期間。検証受け入れは継続するが、削除タイミングを別 spec で定義
5. **旧 `/auth/{provider}/register-with-invitation` エンドポイント削除タイミング**: 新フロー稼働後、即削除 vs 1リリース待機
6. **Web Share API 非対応ブラウザのフォールバックUI**: 単純コピーで十分か、QRコード生成も含むか
7. **PII レスポンス契約**: 招待者情報レスポンスのスキーマ（`name` のみ？マスク `email` を含めるべきか？）
8. **既存 `pendingGoogleUser` 等の sessionStorage クリーンアップ**: 新フロー切替に伴うガベージ削除タイミング

---

## 6. Recommendations for Design Phase

### 推奨アプローチ: **Option C（ハイブリッド）**

**主要決定**:

1. バックエンドは既存 `invitation` ドメインモジュール内で拡張。新規モジュールは作らない（steering の「1ドメイン=1モジュール」遵守）
2. フロントは `/invite/:code` を独立ページとして新規作成。`AuthForm` への詰め込みを避ける
3. OAuth state 引き継ぎは **サーバ側セッション + 短い nonce 方式（候補B）** を第一候補に design で検討（プロバイダ間統一性が高い）
4. 旧 `OAuthService.handleOAuthLogin()` の `INVITATION_REQUIRED` 経路 + 旧エンドポイント5本は新フロー稼働後に **削除**（後方互換維持しない）。Sentry でリリース後の旧経路ヒット数を監視
5. `User.invitationQuota` のデフォルトは **design で確定**（提案: USER=5, ADMIN=null（無制限扱い））
6. nanoid 文字集合は **8文字 + Crockford Base32 風（`0/O/I/L` 除外）** を提案
7. 既存 32文字hexコードは検証受け入れを継続（マイグレーション削除は別 spec）

**設計フェーズで明示すべき項目**:

- DB マイグレーション（`invitationQuota` 追加 + 既存ユーザーへの初期付与）
- API 契約（新規/変更エンドポイント一覧 + リクエスト/レスポンススキーマ）
- OAuth state 引き継ぎのシーケンス図
- フロントのページ・コンポーネント構成図
- 旧コード削除リスト（後続 PR or 同 PR で削除する範囲）
- テスト戦略（既存 auth.controller.spec.ts の書き換え範囲）

### キャリーオーバー（別 spec 候補）

- メール認証フロー（`emailVerified` を実機能化）
- ウェイトリスト
- 招待実績ダッシュボード / ランキング
- 既存 32文字hex コードの DB クリーンアップ
