# Implementation Plan — Refresh Token による自動ログイン

> 凡例: `(P)` = 他の `(P)` タスクと並行実行可能 / `- [ ]*` = MVP 後に回せる任意のテスト補強

## 1. データ基盤と共通定数の整備

- [x] 1.1 (P) Refresh Token 永続化モデルと初期マイグレーションを追加する
  - `RefreshToken` モデル（id / userId / tokenHash / familyId / status / issuedAt / expiresAt / lastUsedAt / ip / userAgent）と `RefreshTokenStatus` enum を Prisma スキーマに追加する
  - `User → RefreshToken` を `onDelete: Cascade` で関連付け、`(tokenHash)` 一意・`(userId, status)` ・`(familyId)` のインデックスを宣言する
  - `add_refresh_tokens` マイグレーションを生成し、`npx prisma migrate dev` および `npx prisma generate` で Prisma クライアントを再生成する
  - _Requirements: 1.4, 1.5, 4.3, 4.4, 4.5_

- [x] 1.2 (P) Refresh Token 関連の環境変数と Auth 定数を整備する
  - `REFRESH_TOKEN_PEPPER` / `REFRESH_TOKEN_EXPIRATION`（既定 30 日）/ `REFRESH_COOKIE_DOMAIN` / `REFRESH_COOKIE_SAMESITE` / `REFRESH_COOKIE_SECURE` を `.env.example` と `ConfigService` に追加し、本番起動時に pepper 未設定なら fail-fast にする
  - 既存 `JWT_EXPIRATION` の既定値を `15m` に変更し、env で上書き可能であることを明示する
  - `THROTTLE_CONFIG.REFRESH = { LIMIT: 10, TTL: 60_000 }` と `REFRESH_COOKIE_NAME = 'refresh_token'` を Auth 定数モジュールへ追加する
  - _Requirements: 1.6, 5.6, 6.1, 7.3_

- [x] 1.3 (P) Refresh Token 系エラーコードを共通エラーコード体系に追加する
  - `AUTH010 REFRESH_TOKEN_INVALID` / `AUTH011 REFRESH_TOKEN_REVOKED` / `AUTH012 REFRESH_TOKEN_REUSED` / `AUTH013 REFRESH_TOKEN_EXPIRED` を `ERROR_CODES.AUTH.*` に追加する
  - フロント側のエラーメッセージ出し分けの土台として、各コードの想定 HTTP ステータス（401）と利用シーンをコメントで明示する
  - _Requirements: 7.4_

## 2. Auth ドメイン共通インフラの拡張

- [ ] 2.1 cookie-parser ミドルウェアと Refresh Cookie ヘルパを導入する
  - `cookie-parser` を依存に追加し、`main.ts` で `app.use(cookieParser())` を Sentry 初期化と CORS の整合性を崩さない位置で読み込む
  - Cookie 属性（HttpOnly / Secure / SameSite / Path=/auth / Domain）を `ConfigService` から組み立てる Set / Clear 二系統のヘルパを実装し、平文 RT はレスポンス body に絶対に乗らない構造にする
  - 既存の CORS 設定（`credentials: true` と `corsOrigins`）が新 Cookie 経路でも成立することを確認する
  - _Requirements: 5.1, 5.2, 5.3, 5.6_

- [ ] 2.2 `/auth/refresh` `/auth/logout` 専用の CSRF Guard を実装する
  - Origin ヘッダが許可済み Origin のいずれかに一致することを検証し、不一致なら 403 を返す
  - カスタムヘッダ `X-Refresh-Request: 1` の存在を必須化し、欠如時も 403 にする
  - dev / preview / production の Origin 差を吸収できるよう `ConfigService.corsOrigins` を単一の真実の源泉として参照する
  - _Requirements: 5.2_

- [ ] 2.3 JWT Auth Guard を `APP_GUARD` でグローバル化し `@Public()` opt-out に揃える
  - `app.module.ts` の providers に `{ provide: APP_GUARD, useClass: JwtAuthGuard }` を追加する
  - 既存の公開ハンドラ（`/health` / `/auth/login` / `/auth/register` / OAuth callback 各種 / テーマシステム公開系 など）に `@Public()` 付与漏れがないか監査し、必要箇所に追加する
  - 既存 `@UseGuards(JwtAuthGuard)` の重複は変更しない（互換性維持。クリーンアップは別タスクへ繰り延べ）
  - _Requirements: 2.7, 6.2_

## 3. Refresh Token サービス層

- [ ] 3.1 Refresh Token のリポジトリ層を実装する
  - `findByHash` / `create` / `markRotated` / `revoke` / `revokeByFamily` / `revokeAllForUser` / `pruneExpired` を提供し、各メソッドは optional な Prisma トランザクションクライアントを受け取る形にする
  - 戻り型はドメインで扱いやすい純粋なレコード型に寄せ、Prisma の生成型をサービス層に露出させない
  - 同一 `tokenHash` の二重作成・status 逆遷移を DB 制約と条件付き update で防ぐ
  - _Requirements: 1.4, 1.5, 4.3, 4.4, 4.5_

- [ ] 3.2 Refresh Token の発行ロジック（issue）を実装する
  - `crypto.randomBytes(32)` で base64url 平文を生成し、HMAC-SHA256 + pepper で `tokenHash` を計算する
  - 発行時に `userId / familyId（新規 family なら採番）/ ip / userAgent / expiresAt` を 1 トランザクションで永続化する
  - DB 書き込み失敗を上位に例外伝播させ、Access Token のみ返る中途半端な状態を作らない
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7_

- [ ] 3.3 Refresh Token のローテーションと reuse 検知を実装する
  - `rotate(plainRt, ip, ua)` で `tokenHash` ルックアップ → 状態検証 → 親の `rotated` 化 → 子の `active` 作成を 1 トランザクションで実行する
  - `status='revoked'` / `expiresAt < now` / レコード不存在を識別し、エラーコード（`AUTH010-013`）に正しくマッピングする
  - `status='rotated'` の RT が再使用された場合は `familyId` 配下を一括 revoke し、Sentry に `refresh_token_reuse_detected`（level: warning, tags: feature_area=auth）を送出する
  - _Requirements: 2.1, 2.2, 2.3, 4.3, 4.4, 7.1_

- [ ] 3.4 Refresh Token の明示 revoke と一括 revoke を実装する
  - `revoke(plainRt)` で `/auth/logout` 由来の単発失効を行い、対象 RT のみ `revoked` 化する（他デバイス系列に波及させない）
  - `revokeAllForUser(userId, reason)` でパスワード変更 / 管理操作由来の一括失効を行い、Sentry に `refresh_token_revoked` を `reason` 付きで送出する
  - revoke 後に `/auth/refresh` で再使用されれば即 401 を返すことをサービス契約として担保する
  - _Requirements: 4.1, 4.3, 4.5, 7.1_

## 4. Auth エンドポイントの拡張

- [ ] 4.1 `/auth/refresh` エンドポイントを新設する
  - `@Public()` + Refresh CSRF Guard + Throttler（`THROTTLE_CONFIG.REFRESH`）の三点セットで保護し、Cookie の `refresh_token` を入力として受け取る
  - 成功時は新しい Access Token と user 情報を body に、新しい Refresh Token を `Set-Cookie` で返却し、平文 RT は一切 body に乗せない
  - 失敗時は 401 + 適切な `AUTH010-013` コードを返し、Sentry に成功/失敗イベントを送る
  - _Requirements: 2.1, 2.7, 7.1, 7.3_

- [ ] 4.2 `/auth/logout` を Refresh Token 失効対応に拡張する
  - 既存のログアウト挙動に加えて、Cookie で渡された RT を `revoke` し、`Set-Cookie: refresh_token=; Max-Age=0` で削除する
  - `@Public()` + Refresh CSRF Guard + Throttler を適用し、CSRF 防御と多重失効攻撃の双方を抑止する
  - Sentry に `refresh_token_revoked`（reason: `logout`）を送出する
  - _Requirements: 4.1, 4.2, 7.1_

- [ ] 4.3 メール/パスワードログインで Access Token と Refresh Token を同時発行する
  - `AuthService.login` の戻り値型を Access Token + user + Refresh 発行情報に拡張し、AT 発行と RT 発行のどちらかが失敗したら全体失敗として扱う
  - Controller 層で Refresh Cookie ヘルパを呼び、レスポンス body の互換性（`{ message, accessToken, user }`）は維持する
  - Sentry に `refresh_token_issued`（level: info, tags: feature_area=auth）を送出する
  - _Requirements: 1.1, 1.7, 6.1, 7.1_

- [ ] 4.4 全 OAuth プロバイダのログインコールバックで Refresh Token を発行する
  - Google / GitHub / LINE / Apple / X の各 `*Login` 経路で AT 発行直後に `RefreshTokenService.issue()` を呼び、戻り値型を全 5 プロバイダで揃える
  - Controller の `handleOAuthCallback` で `res.cookie() → res.redirect()` の順に Cookie を付与し、既存の `?token=...&user=...` クエリ互換を壊さない
  - Apple の POST callback 経路でも同じ並びで Cookie を付与する
  - _Requirements: 1.2, 1.7_

- [ ] 4.5 招待コード経由の新規登録（メール／OAuth）で Refresh Token を発行する
  - メール `/auth/register-with-invitation` および全 5 OAuth プロバイダの `*RegistrationWithInvitation` 経路で AT と RT を同時発行する
  - 登録 → 発行 → Cookie 設定を 1 つのリクエスト処理で完結させ、登録直後のオート自動ログインを実現する
  - 発行失敗時は登録結果も含めて全体失敗として扱う方針を維持する
  - _Requirements: 1.3, 1.7_

- [ ] 4.6 パスワード変更フローで当該ユーザーの全 Refresh Token を失効させる
  - `/auth/change-password` 成功後に `revokeAllForUser(userId, 'password_change')` を呼び、当該ユーザーの全 RT を `revoked` 化する
  - 該当リクエスト自身の Cookie もクリアして、変更後に旧 Cookie で再利用できない状態に揃える
  - 失効件数を Sentry の `refresh_token_revoked`（reason: `password_change`）に同梱する
  - _Requirements: 4.5, 7.1_

## 5. フロントエンド Refresh Client と API Client

- [ ] 5.1 Refresh Client モジュール（透過リフレッシュ + 起動時復元）を新設する
  - `ensureRefreshed()` をモジュールスコープ Promise でシングルトン化し、並行呼び出しを 1 度の `/auth/refresh` に集約する
  - `tryAutoRefresh()` を起動時用エントリとして実装し、Cookie 不在時は `null` を返して例外を投げない設計にする
  - `logout()` ヘルパで `/auth/logout` 呼び出し + AT クリア + Pending Refresh クリアを一括化する
  - 全 fetch を `credentials: 'include'` + `X-Refresh-Request: 1` で送出し、Refresh Token 文字列を JS メモリに保持しない
  - _Requirements: 2.4, 2.5, 2.6, 3.1, 3.2, 5.4, 5.5_

- [ ] 5.2 API Client の 401 経路で透過リフレッシュを発火させる
  - `authLevel='REQUIRED'` のリクエストで 401 を受け取ったら `refreshClient.ensureRefreshed()` を呼び、成功なら同一リクエストを最大 1 回だけ再送する
  - 再送回数を内部フラグで制限し、無限ループとヘッダ再構築漏れを防ぐ
  - `authLevel='NONE'` / `'OPTIONAL'` の経路では従来挙動を維持する
  - _Requirements: 2.4, 2.5_

- [ ] 5.3 Auth Context の初期化シーケンスを Refresh Token 復元優先に再構築する
  - `oauthHandled → tryAutoRefresh → initializeEmailAuth` の三段優先順序に揃え、復元中は `loading=true` でログイン画面を出さない
  - 起動時 refresh 成功で Access Token を Auth Token Manager に保存し、user を Context に反映する
  - 失敗時は Access Token と参照値をすべて削除してログイン画面に遷移させ、Auth Token Manager に Refresh Token 用 API を追加しないことを担保する
  - Sentry に `auto_refresh_success` / `auto_refresh_failure`（tags: feature_area=auth）を送出する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.4_

- [ ] 5.4 ログアウト UX を新 Refresh Client 経由に置き換える
  - 既存ログアウト導線を `refreshClient.logout()` に切り替え、Cookie 削除と AT クリアを同時実行する
  - 透過リフレッシュ失敗時のログアウト遷移と同一フローに統合し、Sentry の breadcrumb（category: `auth`, message: `refresh_failed`）を残す
  - _Requirements: 2.6, 4.2, 7.5_

## 6. 観測性とエラーハンドリングの仕上げ

- [ ] 6.1 (P) Refresh Token 関連イベントの Sentry 送出と PII スクラビングを揃える
  - Backend で `refresh_token_issued` / `refresh_token_rotated` / `refresh_token_revoked` / `refresh_token_reuse_detected` / `refresh_token_issue_failed` の 5 イベントを送出する
  - `refreshToken` / `tokenHash` / `accessToken` キーが既存 scrubber で確実に redact されることを確認し、欠けていれば追加する
  - 全イベントに `feature_area: 'auth'` タグが既存自動分類で乗ることを動作確認する
  - _Requirements: 7.1, 7.2_

- [ ] 6.2 (P) フロント側 Refresh 失敗導線の Sentry breadcrumb と通知を整える
  - `transparent_refresh_success` / `transparent_refresh_failure` breadcrumb を `refreshClient` から送出する
  - 401 で AuthTokenManager をクリアしたタイミングを breadcrumb に残し、ログイン画面遷移との因果関係を追跡可能にする
  - _Requirements: 7.5_

## 7. テスト整備

- [ ] 7.1 (P) Refresh Token サービス／リポジトリ／ヘルパ／Guard の単体テストを追加する
  - `RefreshTokenService` の issue / rotate（成功・revoked・expired・rotated 再使用）/ revoke / revokeAllForUser の各分岐を網羅する
  - `RefreshTokenRepository` の各メソッドが Prisma に意図通りの引数を渡すことを確認する
  - `RefreshCookieHelper` の Cookie 属性が env 値（SameSite / Secure / Domain）に従って切り替わることを検証する
  - `RefreshCsrfGuard` の Origin 不一致 / カスタムヘッダ欠如 / 正常ケースを 3 パターンで検証する
  - _Requirements: 8.1_

- [ ] 7.2 (P) 既存 Auth 系 spec を新戻り値型に追従させ互換性を維持する
  - `auth.service.spec.ts` / `oauth.service.spec.ts` / `auth.controller.spec.ts` / `jwt.service.spec.ts` を Access Token + Refresh Token 同時発行の新戻り値型に追従させる
  - `/auth/refresh` `/auth/logout` の Controller 統合テストで Cookie 受領 → 新 AT 返却 → 新 Cookie 発行までを検証する
  - `/auth/change-password` で当該ユーザーの全 RT が revoke されることを確認する
  - _Requirements: 8.3, 4.5_

- [ ] 7.3 (P) Backend で login → refresh → 期限切れ AT 自動更新の E2E シナリオを実装する
  - login で Cookie 受領 → AT 期限切れ → 通常 API 401 → `/auth/refresh` 経由で新 AT 取得 → 再送 200 までを Supertest で再現する
  - logout 後の `/auth/refresh` が 401 になること、Cookie の HttpOnly / Secure / SameSite が env に追従することを assert する
  - 旧 RT 再使用シナリオで family 全 revoke + 401 + Sentry warning（mock spy）が発火することを確認する
  - _Requirements: 8.4_

- [ ] 7.4 (P) Frontend で透過リフレッシュとアプリ起動時自動復元の Vitest を追加する
  - `ensureRefreshed()` 並行呼び出しで `/auth/refresh` が 1 度だけ発火することを fetch モックで確認する
  - 起動時 `tryAutoRefresh` 成功時に Access Token が保存され user が返ること、401 時に AuthTokenManager がクリアされ Sentry breadcrumb が残ることを検証する
  - apiClient の 401 → ensureRefreshed → 同一リクエスト再送の 1 回限定挙動をモックで確認する
  - _Requirements: 8.2_

- [ ]\* 7.5 (P) ブラウザ再起動相当の Playwright E2E を追加する
  - localStorage の Access Token のみ削除（Cookie は維持）した状態で再ロードし、ログイン画面ではなく直接エディタが表示されることを assert する
  - 失敗系として Cookie も削除した状態で再ロードしログイン画面に遷移することを assert する
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

## 8. リリース整合性の検証

- [ ] 8.1 旧 Access Token との互換性とマイグレーション運用を検証する
  - リリース直後に旧 24h AT が `exp` まで通常受理されること、Cookie 不在時の `/auth/refresh` は 401 で 1 回再ログインに帰着することを手動シナリオで確認する
  - `npx prisma migrate deploy` を Cloud Run prebuild に組み込んだ前提で、`/health` / `/auth/login` / `/auth/refresh` / Sentry `refresh_token_issued` イベント発火の 4 点をデプロイ後チェックリスト化する
  - 機構自体に隠しフィーチャーフラグを持たず、常時 ON でデプロイされていることをコード上で再確認する
  - _Requirements: 6.3, 6.4, 8.5_
