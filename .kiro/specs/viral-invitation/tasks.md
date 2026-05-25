# Implementation Plan

> 並列実行可能なタスクには `(P)` を付与。`(P)` は同一ファイル・同一サービスを触らず、かつ前段タスクへのデータ依存がないものだけに付ける。

- [x] 1. 招待 quota スキーマ・環境変数・エラーコードの基盤整備
- [x] 1.1 (P) Prisma `User.invitationQuota` カラム追加とマイグレーション作成
  - `User` モデルに `invitationQuota`（整数、デフォルト `5`）を追加し、`@map("invitation_quota")` で snake_case に揃える
  - マイグレーションファイルを `npx prisma migrate dev --name add_user_invitation_quota` で生成し、`ALTER TABLE users ADD COLUMN invitation_quota INTEGER NOT NULL DEFAULT 5` のみを含む内容に整える
  - 既存レコードはデフォルト値で自動初期化されることを `prisma migrate diff` 出力で確認（追加 UPDATE 文を含めない）
  - ADMIN ユーザーにも一律 `5` 付与されるが、評価関数で参照されないため整合性は保たれることをマイグレーション内コメントで明示
  - 生成後に `npx prisma generate` を実行し、型定義に新フィールドが反映されることを確認
  - _Requirements: 4.1, 4.2, 9.4_

- [x] 1.2 (P) OAuth state 用シークレットを環境変数として導入
  - `INVITATION_STATE_SECRET` を `.env.example` および Docker Compose の `backend` サービス env に追加
  - `ConfigService` のスキーマに必須項目として登録し、未設定時は起動時に明確なエラーで拒否する
  - `JWT_SECRET` から完全に分離されていること（同値であってもアプリ層で参照を分けること）を `app.module.ts` セットアップで保証
  - ローカル開発用のデフォルト値生成手順（`openssl rand -hex 32`）を `.env.example` のコメントとして添える
  - _Requirements: 3.3, 3.4_

- [x] 1.3 (P) `ERROR_CODES.INVITATION` に `QUOTA_EXHAUSTED` を追加
  - 既存の `INV001` 〜 `INV004` に続けて `QUOTA_EXHAUSTED = 'INV005'` を定義
  - `AppExceptionFilter` 経由のレスポンスに新コードが乗ることを既存ヘルパー（`throwBadRequest`）で送出可能にする
  - フロント側 `ErrorCode` 型（`shared` または `types` 配下）にも同コードを反映し、型レベルで網羅性を担保
  - _Requirements: 7.1_

- [ ] 2. Backend: 招待ドメインの基礎ユーティリティ
- [x] 2.1 (P) `CodeGenerator` を nanoid no-look-alike alphabet で実装
  - `nanoid` を `backend/package.json` の依存に追加（`customAlphabet` を使用）
  - alphabet は `346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtuvwxy`（49 文字、`0/O/1/I/l/L/2/Z/5/S/_/-` 除外）、長さは 10 固定
  - 旧 32 文字 hex 形式を判別する `isLegacyFormat` を提供し、Sentry breadcrumb 用に利用できるようにする
  - DI トークン `CODE_GENERATOR` で公開し、テストから差し替え可能にする
  - 衝突は理論上ほぼ 0 だが、呼び出し側でリトライできるよう副作用ゼロのピュア関数として実装
  - _Requirements: 2.1, 2.2_

- [x] 2.2 (P) `QuotaPolicy` の実装（ロール別評価と楽観ロック減算）
  - Prisma トランザクションクライアントを受け取り、ADMIN は無条件で `{ allowed: true, consumed: false }` を返す
  - USER は `update where: { id, role: 'USER', invitationQuota: { gt: 0 } }` で 1 減算し、影響行数 0 件なら `{ allowed: false, code: 'QUOTA_EXHAUSTED' }` を返す（楽観ロック相当）
  - `invitationQuota` が負にならない不変条件を関数内で保証
  - InjectionToken で公開し、`InvitationService` から DI 経由で利用
  - _Requirements: 4.3, 4.4, 4.5, 9.4_

- [x] 3. Backend: `InvitationService` の拡張
- [x] 3.1 `verifyInvitation` を新エラーコード体系へ統一し、後方互換と招待者情報返却を担保
  - 旧 32 文字 hex と新 10 文字 nanoid を同一ロジックで受理（コード長に依存しない検索）
  - 失敗は `throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE | EXPIRED | MAX_USES_REACHED)` のいずれかに統一
  - 戻り値の `InvitationContext` に `creator: { id, name, maskedId }` と `expiresAt`、`usesRemaining` を含める
  - `maskedId` は `createdById` の先頭 4 文字 + `***` の安全な短縮表現として組み立てる
  - email など PII は含めず、Sentry スクラバ規約と整合
  - _Requirements: 2.3, 6.2, 6.4, 7.1_

- [x] 3.2 `createForUser` を Prisma インタラクティブトランザクションで実装し `QuotaPolicy` と連携
  - `tx` 内で `QuotaPolicy.evaluateAndConsume` → 拒否なら `QUOTA_EXHAUSTED` を throw してロールバック
  - 許可されたら `CodeGenerator.generate()` で発行 → `InvitationCode.create({ maxUses: 1, ... })` で「通常コード」として永続化（キャンペーンコードは ADMIN 経路のみ）
  - 戻り値に発行レコードとともに `shareUrl` を含めるが、URL 組み立て自体は Controller 層に委ねる（サービス層は文字列 URL を関知しない）
  - 既存 `createInvitation`（ADMIN 経路）は `maxUses` 可変・quota 非減算で残置し、通常/キャンペーンの 2 区分を維持
  - 衝突時は最大 3 回まで生成リトライ（unique 違反のみキャッチ、それ以外は伝播）
  - _Requirements: 2.1, 4.3, 4.4, 4.5, 9.3_

- [x] 3.3 自分用の取得・削除メソッド群を追加（PII 除外）
  - `getMyInvitations(userId)` は `createdById = userId` の招待を発行日時降順で返却
  - `getMyQuota(userId)` は `{ invitationQuota, unlimited, role }` を返却（ADMIN の `unlimited` は true 固定）
  - `deleteMyInvitation(id, ownerId)` は `AuthorizationService.checkOwnership()` 経由で所有権を検証し、`usedCount > 0` でも削除を許可（既に消費済みの履歴は別途検討）
  - いずれのメソッドも email や OAuth provider id 等の機微情報を含めない
  - _Requirements: 4.6, 4.7, 6.4_

- [x] 4. Backend: `InvitationController` の API 追加と共有 URL 整備
- [x] 4.1 受信者向け `/invitation/verify-context` エンドポイントを Public + Throttler で公開
  - `@Public()` を付与し未認証アクセスを許可
  - `@Throttle({ default: { limit: 30, ttl: 60_000 } })` を適用しブルートフォース耐性を担保
  - リクエスト DTO の `code` を `class-validator` で 8〜50 文字・英数字のみに制限
  - `InvitationService.verifyInvitation` の結果を `InvitationContextResponse` 形に整形して返却（email 等を含めない）
  - 失敗時は構造化エラーコード（`INVALID_CODE` / `EXPIRED` / `MAX_USES_REACHED`）を 400 で返す
  - _Requirements: 1.3, 6.2, 6.4_

- [x] 4.2 自分用 quota / 招待一覧 / 発行 / 削除エンドポイントを実装
  - `POST /invitation/me`、`GET /invitation/me`、`GET /invitation/me/quota`、`DELETE /invitation/me/:id` を追加
  - 全エンドポイントを JWT 必須（既定保護）にし、削除は `AuthorizationService.checkOwnership()` を経由
  - レスポンスは `InvitationWithShareUrlResponse` / `UserQuotaResponse` 形に統一し、PII を含めない
  - quota 不足時は `QUOTA_EXHAUSTED` を 400 で返却
  - 既存 ADMIN ルート（`POST /invitation`、`GET /invitation`、`DELETE /invitation/:id`、`POST /invitation/verify`）は互換維持のため変更しない
  - _Requirements: 4.6, 4.7, 9.3_

- [x] 4.3 発行系レスポンスに共有用絶対 URL を付与
  - `ConfigService.frontendUrl` を Controller 層で参照し `{FRONTEND_URL}/invite/{code}` 形式を組み立てる
  - 新規発行（`POST /invitation/me`、ADMIN 経路 `POST /invitation`）、一覧取得（`GET /invitation/me`）両方のレスポンスに `shareUrl` を含める
  - `FRONTEND_URL` 末尾スラッシュの有無による二重スラッシュを排除するヘルパーを利用
  - _Requirements: 2.5, 5.5_

- [x] 5. Backend: OAuth 順序逆転（state 引き継ぎ）の新フロー
- [x] 5.1 (P) `InvitationStateService` を HMAC-SHA256 で実装
  - ペイロード `{ code, provider, nonce, iat }` を `base64url(payload).base64url(signature)` 形式の文字列で表現
  - 署名鍵は `INVITATION_STATE_SECRET` を `ConfigService` 経由で取得、未設定時はサービス初期化で例外
  - `verifyState` は `crypto.timingSafeEqual` でタイミング攻撃耐性を確保し、`iat` 経過 10 分超 / provider 不一致 / 改ざんペイロード / base64 不正の全てを `ERROR_CODES.INVITATION.INVALID_CODE` で拒否
  - `nonce` は `crypto.randomBytes(16).toString('hex')` で生成し CSRF nonce として内包
  - passport-oauth2 の `state: true` は使用せず、本サービスが state 文字列の単一権威となる
  - _Requirements: 3.3, 3.4_

- [x] 5.2 (P) `OAuthService` に 5 プロバイダ分の state 由来登録メソッドを追加
  - `googleRegisterWithStateInvitation` / `githubRegisterWithStateInvitation` / `lineRegisterWithStateInvitation` / `appleRegisterWithStateInvitation` / `xRegisterWithStateInvitation` を追加
  - 共通処理（ユーザー作成 → `InvitationService.useInvitation` で消費 → `JwtTokenService` でアクセストークン発行 → `RefreshTokenService` で refresh cookie 設定）を private helper `consumeAndIssue()` に集約
  - admin email 該当者は `role: 'ADMIN'`、それ以外は `role: 'USER'` で作成（既存 `handleOAuthLogin` の admin 例外と整合）
  - Apple 経路は form_post の `fallbackEmail` を受け取り email が欠落しても登録できるよう既存挙動を維持
  - 旧 `*RegisterWithInvitation` 5 本および `handleOAuthRegistrationWithInvitation` の削除は手順 9 で実施するため、本タスクでは追加のみ
  - _Requirements: 3.4, 3.5, 8.1, 9.1, 9.2_

- [x] 5.3 `AuthController` に OAuth 開始エンドポイントを 5 プロバイダ統一で新設
  - `POST /auth/oauth/:provider/start` を `@Public()` で公開し、`invitationCode` を受領
  - 受領後に `InvitationService.verifyInvitation` で開始前検証（失敗時は OAuth へリダイレクトせず構造化エラーを返却）
  - 検証成功時に `InvitationStateService.issueState` で signedState を生成し、passport の `authenticate(provider, { state: signedState })` に渡して認可 URL を組み立て
  - レスポンスは `{ authorizationUrl }`（または 302 redirect、SPA 経由の前提に合わせて選択）
  - `auth.controller.public-audit.spec.ts` の Public 判定対象に新エンドポイントを追加する
  - _Requirements: 3.1, 3.2, 9.2_

- [x] 5.4 5 プロバイダの OAuth コールバックに state 検証分岐を組み込む
  - `GET /auth/{google|github|line|x}/callback` および `POST /auth/apple/callback`（form_post）共通で `req.query.state` または `req.body.state` を取得
  - state が存在すれば `InvitationStateService.verifyState(state, provider)` を実行 → 成功時のみ `OAuthService.*RegisterWithStateInvitation` を呼び出し新規登録 + 自動ログインを完了
  - state なしの callback は既存「ログインまたは admin email 経由新規」経路をそのまま維持
  - 検証失敗時は `/invite/:code?error=invalid_state` にリダイレクトし、Sentry に `invitation_state_invalid` を記録（コード文字列はスクラバ対象、`invitation_failure_code` タグのみ付与）
  - 5 プロバイダ全てで同一の small dispatcher 関数を経由させ、分岐ロジックの二重実装を避ける
  - _Requirements: 3.3, 3.4, 7.4, 9.2_

- [x] 6. Frontend: 共通ユーティリティとフックの基盤整備
- [x] 6.1 (P) `invitationErrorMessages` 定数を整備
  - `ErrorCode`（`INV001` 〜 `INV005`）→ 日本語文言のマッピングを定義
  - 例: `INVALID_CODE → 招待コードが無効です` / `EXPIRED → 招待コードの有効期限が切れています` / `MAX_USES_REACHED → 招待コードの使用上限に達しました` / `QUOTA_EXHAUSTED → 招待枠を使い切りました`
  - 未知コードのフォールバック文言（汎用エラー）も含める
  - 文言は表示専用、Sentry breadcrumb 用の英語キー（`invitation_failure_code: INV001` 等）とは分離
  - _Requirements: 7.3_

- [x] 6.2 (P) `shareInvitation` util（Web Share + clipboard フォールバック）
  - `navigator.canShare` で share 可否を判定 → 可なら `navigator.share`、不可なら `navigator.clipboard.writeText` にフォールバック
  - 戻り値は `{ method: 'web-share' | 'clipboard' | 'failed', cancelled?, error? }`
  - `navigator.share` の `AbortError`（ユーザーキャンセル）は失敗扱いにせず `{ method: 'web-share', cancelled: true }` を返す
  - HTTPS でない環境では両 API ともに失敗し `failed` を返す（ローカルは `localhost` 例外で動作）
  - _Requirements: 5.3, 5.4_

- [x] 6.3 `apiClient`（`utils/api.ts`）に招待関連メソッドを追加
  - `verifyInvitationContext({ code })` / `createMyInvitation()` / `getMyInvitations()` / `getMyInvitationQuota()` / `deleteMyInvitation({ id })` / `startOAuthRegistration({ provider, invitationCode })` を追加
  - レスポンスから `{ code, message, statusCode }` 形式の `ApiError` を抽出する共通ロジックを整備（文字列 `includes` 判定は使わない）
  - `ApiError.code` を型として `ErrorCode` で表現し、呼び出し側の網羅判定を可能にする
  - 直接 `fetch` 禁止の規約を順守し、必ず `apiClient` 経由で外部呼び出しを行う
  - _Requirements: 7.2_

- [x] 6.4 `useInvitationsQueries` で招待関連 Hook を集約
  - `useInvitationContext({ code })` を `enabled: !!code` + `retry: false` で実装し、エラーを `ApiError` のまま伝播
  - `useMyInvitations` / `useMyInvitationQuota` / `useCreateMyInvitation` / `useDeleteMyInvitation` を実装、mutation 成功時に対応 query を `invalidateQueries`
  - `useStartOAuthRegistration` を mutation として実装（成功時に `window.location.assign(authorizationUrl)` の起動はコンポーネント側責務）
  - `queryKeys.invitations.*`（context / quota / list）を `constants/queryKeys.ts` に拡張し、すべての Hook で一元参照
  - サーバー状態は React Query に閉じ、Zustand への複製を行わない
  - _Requirements: 1.2, 4.6, 5.2, 5.5, 7.2_

- [x] 7. Frontend: 招待 URL ページと AuthForm の改修
- [x] 7.1 `/invite/:code` ルートと `InvitePage` の新規実装
  - `App.tsx`（または route 定義）に `/invite/:code` を追加し未認証ユーザー向けに開放
  - マウント時に `useInvitationContext({ code })` を実行し、成功時は `AuthForm` を prefilled な招待コードと招待者文脈付きで表示
  - 招待者 `name` が null の場合は「あるユーザーから招待されました」等の汎用文言にフォールバック
  - エラー時はコードごとに `invitationErrorMessages` から文言を引き、`InvitationErrorBanner` と「招待コードなしのトップへ戻る」導線を提示
  - 認証済みユーザーが踏んだ場合は `useAuthGuard()` 経由でアプリホームへリダイレクト
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.3_

- [x] 7.2 `AuthForm` を新フロー（prefill / 属性 / OAuth start / 自動ログイン文言）に整合
  - 招待コード入力欄に `autoCapitalize="off"` / `autoComplete="off"` / `inputMode="text"` / `spellCheck={false}` を付与
  - prefill 時もユーザー編集を許容し、別コードに差し替え可能な状態を維持
  - OAuth ボタン押下時は `useStartOAuthRegistration` で `/auth/oauth/:provider/start` を呼び、返却された `authorizationUrl` に `window.location.assign` で遷移
  - 失敗時のエラー分岐を `ApiError.code` 判定に統一し、`invitationErrorMessages` から文言取得
  - `EmailAuthForm` の「Registration successful! You can now login with your credentials.」等の自動ログインと矛盾する文言を削除し、登録成功後は `useNavigation` 経由でホーム遷移
  - _Requirements: 1.5, 2.4, 7.2, 7.3, 8.1, 8.2, 8.3_

- [x] 8. Frontend: Settings の友達招待 UI
- [x] 8.1 `InvitationCard` の実装（quota 可視化・発行・一覧・共有・無効化）
  - 現在の quota 残数を `useMyInvitationQuota` から取得しバッジ表示（例: `3 / 5`、ADMIN は「無制限」表示）
  - 「招待リンクを発行」操作で `useCreateMyInvitation` を mutate → 一覧の先頭に追加、発行直後に `shareInvitation(shareUrl)` を呼ぶオプションを提示
  - 発行済み一覧に `code` / `usedCount`/`maxUses` / 発行日 / 共有ボタン / 削除ボタンを表示
  - quota 0 かつ USER ロールでは発行ボタンを `disabled` + ツールチップで「招待枠を使い切りました」を表示
  - Web Share / clipboard / failed の結果別に toast を出し、AbortError は無音
  - _Requirements: 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 8.2 `SettingsPage` への組み込み
  - 既存 `SettingsPage` 内の適切な位置に「友達を招待」セクションとして `InvitationCard` を配置
  - ADMIN 用 `InvitationManager.tsx` は ADMIN 画面にそのまま残置し、一般ユーザー UI（`InvitationCard`）と責務を分離
  - レイアウトはモバイル幅でも操作可能なタッチターゲットサイズを確保
  - _Requirements: 5.1_

- [x] 9. 旧フロー削除と Sentry 連携統一
- [x] 9.1 旧 `/auth/{provider}/register-with-invitation` 5 本と `INVITATION_REQUIRED` 経路を削除
  - `AuthController` から 5 プロバイダ分の `register-with-invitation` ルートを削除
  - `OAuthService.handleOAuthRegistrationWithInvitation` / `*RegisterWithInvitation`（5 本）を削除（admin email 例外を含む通常ログイン経路は維持）
  - `INVITATION_REQUIRED` を throw していたコードパスを除去し、新フローでは到達不能であることを `oauth.service.spec.ts` の網羅テストで担保
  - フロントの `OAuthInviteForm.tsx`、`pending{Provider}User` の sessionStorage 操作、`?error=invitation_required` ハンドラを削除
  - `generateInvitationRequiredUrl` の呼び出しを撤去
  - _Requirements: 3.5, 3.6_

- [x] 9.2 文字列マッチ判定撤去と Sentry `feature_area: invitation` 失敗記録
  - `errorMessage.includes('invitation code')` などの文字列マッチ判定を全箇所撤去し、`ApiError.code` での分岐に統一（バックエンド・フロント双方）
  - OAuth コールバック内の招待関連例外で `Sentry.captureMessage('invitation_state_invalid', { tags: { feature_area: 'invitation', invitation_failure_code: <code> } })` を呼ぶ
  - 招待コード文字列自体は Sentry イベント本文に含めず、タグのみで失敗を追跡（PII スクラバ規約と整合）
  - 既存の `/invitation` URL prefix 自動付与（`feature_area: invitation`）が新エンドポイントにも適用されることを確認
  - _Requirements: 7.2, 7.4_

- [x] 10. テスト・統合検証
- [x] 10.1 (P) Backend ユニットテスト整備
  - `CodeGenerator.generate()`: 100 回呼び出して長さ 10 / alphabet 範囲内 / 重複なしを確認、`isLegacyFormat` の境界も検証
  - `QuotaPolicy.evaluateAndConsume()`: USER quota>0 / USER quota==0 / ADMIN の 3 ケースで戻り値と DB 副作用を検証
  - `InvitationStateService`: 正常往復・改ざんペイロード・期限切れ（iat>10 分）・provider 不一致・base64 不正の 5 ケース
  - `InvitationService.createForUser`: トランザクション内 quota 減算と発行レコード作成の整合性、リトライ動作
  - `OAuthService`: admin email 例外 / 既存ユーザー再ログイン / state 経由新規作成 の 3 系統を 5 プロバイダ分でカバー
  - _Requirements: 2.1, 2.2, 2.3, 3.3, 3.4, 4.3, 4.4, 4.5, 8.1, 9.1, 9.2_

- [x] 10.2 (P) Backend 統合テスト整備
  - `POST /invitation/me`: USER quota 5 → 1 減算、quota 0 → `QUOTA_EXHAUSTED`、ADMIN → quota 不変、`shareUrl` がレスポンスに含まれる
  - `POST /invitation/verify-context`: 有効コード成功 / 4 種失敗コード / Throttler 30/min 超過時 429 を確認
  - `POST /auth/oauth/google/start` → mock passport → callback → 新規ユーザー作成 + access token + refresh cookie 発行までのエンドツーエンド
  - `GET /auth/google/callback` で state 改ざん → `/invite/:code?error=invalid_state` リダイレクトを確認
  - 旧 `/auth/{provider}/register-with-invitation` 5 本への POST が 404 を返す（削除確認）
  - _Requirements: 1.3, 3.1, 3.2, 3.6, 4.3, 4.4, 4.6, 7.1, 9.2_

- [x] 10.3 (P) Frontend ユニットテスト整備
  - `useInvitationsQueries`: `useInvitationContext` の `retry: false`、mutation 成功時の `invalidateQueries`、`ApiError.code` 伝播を確認
  - `shareInvitation`: `navigator.share` あり / なし / AbortError の 3 経路と HTTPS 未満時の `failed` 戻り
  - `invitationErrorMessages`: 全 `ErrorCode` の網羅マッピング、未知コード時のフォールバック
  - `AuthForm` 改修: 入力欄属性 / prefill 編集可能性 / OAuth start 呼び出し / 「Registration successful...」文言が表示されない
  - `InvitationCard`: quota 残数表示 / quota 0 時の発行ボタン disabled / Web Share と clipboard のフォールバック動作
  - _Requirements: 1.2, 1.5, 2.4, 5.1, 5.3, 5.4, 5.6, 7.2, 7.3, 8.2, 8.3_

- [x] 10.4 E2E と Sentry 監視チェックポイント検証
  - Playwright で `/invite/{code}` を踏む → 招待者名表示 → メール登録完了 → ホーム遷移（自動ログイン文言が出ない）を確認
  - Settings の「友達を招待」→ 発行 → 共有ボタン（Web Share またはクリップボード）が起動するシナリオを確認
  - quota 0 USER の Settings で発行ボタンが disabled になることを確認
  - Sentry ダッシュボードで `feature_area: invitation` タグ付きイベントを発生させ、`invitation_failure_code` / `invitation_state_invalid` が正しく分類されることを確認
  - 旧フロー削除後 30 日間、`auth.controller.handleOAuthCallback` 内の旧経路ヒットが 0 件であることを KPI として記録
  - _Requirements: 1.1, 1.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.6, 7.4, 8.2_
