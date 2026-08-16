# Gap Analysis: password-reset-email

> 承認済み要件（requirements.md / R1〜R6）と既存コードベースの差分分析。設計フェーズの意思決定材料を提供する。最終的な実装選択は行わない。

## 1. 現状調査（Current State）

### 1.1 既存の再利用可能アセット

| 資産                                                   | 場所                                                                     | 状態 / 備考                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------- |
| `resetPasswordToken` / `resetPasswordExpires`          | `prisma/schema.prisma:152-153`（`String?` / `DateTime?`）                | **既存カラム。マイグレーション不要**。token はハッシュ文字列を格納する想定                        |
| `POST /auth/reset-password`                            | `auth.controller.ts:427-464`                                             | スタブ実装。`findUnique` のみで `// TODO: メール送信機能を実装`。`@Public()` + try/catch あり     |
| `ResetPasswordRequestDto`（email）                     | `auth/dto/reset-password.dto.ts`                                         | 要求エンドポイントで使用中                                                                        |
| `ResetPasswordDto`（token + newPassword）              | `auth/dto/reset-password.dto.ts`                                         | **定義済みだが未使用**。`@IsStrongPassword` 付き。確定エンドポイントの受け皿として流用可能        |
| `hashPassword` / `comparePassword`                     | `auth.service.ts:32-37`（bcrypt, `BCRYPT_SALT_ROUNDS=12`）               | R4.6 のパスワード保存にそのまま使える                                                             |
| `IsStrongPassword` バリデータ                          | `auth/validators/password-strength.validator.ts`                         | R4.4 の強度検証。`ResetPasswordDto` に既に適用済み                                                |
| `refreshTokenService.revokeAllForUser(userId, reason)` | `auth/refresh-token.service.ts:166`                                      | R5.5 用。`changePassword` が `'password_change'` で利用中。`RevokeAllReason` 型に新理由追加が要る |
| 機能フラグ `PASSWORD_RESET_EMAIL`                      | `config/features.config.ts:32` / `.env.example:113`                      | **既に `FEATURE_PASSWORD_RESET_EMAIL=false` で用意済み**。`isFeatureEnabled()` で参照可           |
| OAuth 未設定時の警告パターン                           | `auth/google.strategy.ts:22-27`（`isConfigured` + `logger.warn`）        | R6.4「API キー未設定なら警告ログ出して起動継続」のモデル                                          |
| Sentry タグ付け                                        | `refresh-token.service.ts:78` 等（`{ tags: { feature_area: 'auth' } }`） | R2.4 / R6.5 の `feature_area: 'auth'` 分類はこの慣例に従う                                        |
| `AppLogger`                                            | `common/logger/app-logger.service.ts`（`log/warn/error` + context）      | R1.5 のログ。PII を出力しない運用                                                                 |
| `THROTTLE_CONFIG` + `@Throttle`                        | `config/auth-constants.ts:42` / controller 各所                          | R3.4 / R5.4 のレート制限。**reset 専用設定は未定義**（LOGIN/REGISTER 等はある）                   |
| `ERROR_CODES.AUTH.INVALID_TOKEN`（AUTH003）            | `common/exceptions/error-codes.ts:17`                                    | R4.2 の無効トークンに流用可。期限切れ（R4.3）専用コードは未定義                                   |
| `frontendUrl` getter                                   | `config/config.service.ts:65`（`FRONTEND_URL                             |                                                                                                   | 'http://localhost'`） | R6.2 のリセット URL ベース導出元の候補 |

### 1.2 規約・パターン

- 認証はグローバル JWT Guard + `@Public()` オプトアウト。公開エンドポイントは `@Public()` + `@Throttle()` を併用。
- エラーは `ERROR_CODES` + `throwBadRequest/throwUnauthorized`（`app.exception.ts`）。
- DI は NestJS。サービスは module の providers に登録。テストは同階層 `*.spec.ts`（TDD: RED→GREEN→REFACTOR）。
- Sentry は `Sentry.captureException(err, { tags: { feature_area } })` を直接呼ぶ。
- 環境変数は `process.env` 直読み + `ConfigService` getter / `features.config.ts` ラッパ。

## 2. 要件↔資産マップ（Feasibility / Gaps）

| 要件              | 必要な技術要素                                | 既存資産                                              | ギャップ種別                                              |
| ----------------- | --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| R1 トークン発行   | crypto ランダム生成 + ハッシュ保存 + 期限設定 | カラム既存 / `crypto` 標準                            | **Missing**: トークンのハッシュ方式（下記研究項目）       |
| R2 メール送信     | Resend SDK + メール送信サービス + URL 構築    | なし                                                  | **Missing**: `resend` 依存 / `MailService` / テンプレート |
| R3 列挙対策       | 一貫レスポンス + throttle                     | スタブが既に曖昧レスポンス / `@Throttle`              | **Constraint**: タイミング差・分岐差の排除                |
| R4 検証＋設定     | 確定エンドポイント + token 照合 + bcrypt      | `ResetPasswordDto` / `hashPassword` / 強度バリデータ  | **Missing**: 確定エンドポイント本体                       |
| R5 ライフサイクル | token クリア + 単回 + RT revoke               | `revokeAllForUser`                                    | **Missing**: `RevokeAllReason` に `'password_reset'` 追加 |
| R6 設定・運用     | env 化 + 未設定警告 + Sentry タグ             | features フラグ / OAuth warn パターン / `frontendUrl` | **Missing**: `RESEND_API_KEY` / リセット URL ベース env   |

### 2.1 重大ギャップ（要設計判断）

1. **フロント側にトークン確定画面が存在しない（最重要）**
   - `App.tsx:75` の `/auth/reset-password` ルートは `PasswordReset.tsx` をレンダーするが、これは **`currentPassword` を要求する「パスワード変更」UI**（`changePassword` を呼ぶ）であり、`?token=` を読まない。
   - `PasswordResetForm.tsx` は **メール入力→送信のみ**で、トークンを解釈しない。
   - → 要件 R2.2 の「`PasswordResetForm.tsx` が解釈可能な形式」という前提は**実態と食い違う**。メールのリンクを踏んでも、トークンを受け取って新パスワードを送るフロント画面が無い＝バックエンドの確定エンドポイントが UI から到達不能。
   - requirements の「対象外」はテンプレート多言語化等のみで、フロント確定画面の扱いが未定義。**設計フェーズでスコープ確定が必要**（バックエンドのみ実装し別 spec で UI を作るか、本 spec に最小限の確定画面を含めるか）。

2. **トークンのハッシュ方式（bcrypt vs sha256）**
   - R1.2 は「ハッシュ化して保存」、R4.1 は「受領トークンをハッシュ化し保存済みと照合」。
   - bcrypt はソルトが毎回異なり**トークンで DB 検索できない**（`comparePassword` は対象 hash を渡す前提）。確定時に user を引くキーが必要 → **sha256 等の決定的ハッシュ**が定石（`where: { resetPasswordToken: sha256(token) }`）。
   - パスワードは bcrypt 維持、トークンは sha256、と方式を分ける設計判断が要る。

3. **メールプロバイダ依存の不在**
   - `resend` / `nodemailer` 等いずれも未インストール（`backend/package.json` に無し）。Resend SDK 導入 + `MailService`（`MailModule`）新規作成が必要。Cloud Run からの外部 egress 前提。

## 3. 実装アプローチ案

### Option A: 既存 controller を拡張（最小新規）

- `auth.controller.ts` の `resetPassword` を本実装化し、確定用ハンドラ（例 `POST /auth/reset-password/confirm`）を同 controller に追加。メール送信は薄い `MailService` に委譲。
- ✅ 既存 throttle/Public/エラー慣例を最短で踏襲、ファイル増最小。
- ❌ controller が肥大。トークン発行・検証ロジックが controller に混ざり単体テストしづらい。

### Option B: `PasswordResetService` + `MailModule` を新規作成（責務分離）

- 発行・送信・検証・ライフサイクルを `PasswordResetService` に集約。controller は薄いまま委譲。`MailModule`（`MailService` + Resend ラッパ）を独立 module 化。
- ✅ 単体テスト容易（列挙対策の一貫性・トークン単回性を service テストで担保）、SRP 維持、`MailService` を将来の通知系で再利用可。
- ❌ 新規ファイル数増・DI 配線が必要。

### Option C: ハイブリッド（推奨）

- **バックエンド**: Option B（`MailModule` + `PasswordResetService`）。
- **フロント**: 段階分け。Phase 1 はバックエンド + `MailService` を機能フラグ `FEATURE_PASSWORD_RESET_EMAIL` 配下で実装。Phase 2 でトークン確定画面（`/auth/reset-password/confirm?token=` を読む新コンポーネント）を追加 or 別 spec 化。
- ✅ 列挙対策・トークン安全性をテスト可能な単位に閉じ込めつつ、UI スコープの不確実性をフラグ＋段階導入で吸収。
- ❌ フロント側スコープを設計時に明示合意する必要。

## 4. 工数・リスク

| 項目                       | 評価                 | 根拠                                                                                                       |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| 全体工数                   | **M（3-7日）**       | カラム・DTO・bcrypt・throttle・フラグが既存。新規は Resend 連携・確定 endpoint・（場合により）フロント画面 |
| トークン/列挙対策の安全性  | **Medium**           | 方式（sha256）と一貫レスポンス設計は定石だがテストで厳密に担保が必要                                       |
| Resend 外部連携            | **Medium**           | 新規依存。Cloud Run egress / 本番ドメイン認証（SPF/DKIM）は運用要確認                                      |
| フロント確定画面のスコープ | **High（不確実性）** | 要件の前提と実態が不一致。スコープ未確定のまま進むと UI 到達不能のリスク                                   |

## 5. 設計フェーズへの申し送り

**推奨アプローチ**: Option C（バックエンド = 責務分離、フロント = 段階導入 / スコープ明示）。

**スコープ決定（ユーザー確認済み）**:

- **フロントのトークン確定画面を本 spec に含める**。新コンポーネント `PasswordResetConfirm.tsx` を新ルート `/auth/reset-password/confirm` に追加し、`?token=` を `useSearchParams` で読み、新 API `AuthAPI.confirmPasswordReset(token, newPassword)` 経由で確定エンドポイントを叩く。既存 `/auth/reset-password`（ログイン中のパスワード変更 UI = `PasswordReset.tsx`）とはパスを分けて衝突回避。リセット URL ベース = `FRONTEND_URL` + `/auth/reset-password/confirm`。これにより `FEATURE_PASSWORD_RESET_EMAIL` ON で即エンドツーエンド動作する。

**設計で決めるべき主要判断**: 2. トークンのハッシュ方式（sha256 推奨）と保存形式。3. 確定エンドポイントのパス命名（`POST /auth/reset-password/confirm` 等）と `ResetPasswordDto` 流用。4. env 追加（R6.2 / R6.3）: リセット URL ベース（`FRONTEND_URL` + `/auth/reset-password/confirm` 導出を推奨）、`RESEND_API_KEY`、**送信元アドレス `MAIL_FROM`**（dev = `onboarding@resend.dev` / 本番 = `noreply@mosaku.jp` 等）を `.env.example` 追記。本番は **Resend での mosaku.jp ドメイン認証（DKIM/SPF DNS レコード追加）** が前提作業。5. エラーコード方針: `AUTH003 INVALID_TOKEN` 流用か、`RESET_TOKEN_EXPIRED` 等を新設するか。6. `RevokeAllReason` への `'password_reset'` 追加（R5.5）。7. 機能フラグ `FEATURE_PASSWORD_RESET_EMAIL` / Resend キー未設定時の挙動分岐（R6.4、OAuth strategy パターン準拠）。

**Research Needed（設計フェーズで調査）**:

- Resend SDK（`resend` npm）の Node/NestJS 連携・送信失敗時の例外型・Cloud Run からの到達性。
- Resend の送信元ドメイン認証（本番 mosaku.jp の SPF/DKIM）と無料枠制限。
- 列挙対策のタイミング攻撃緩和（存在しないユーザー時もハッシュ計算等で処理時間を揃えるか）。
