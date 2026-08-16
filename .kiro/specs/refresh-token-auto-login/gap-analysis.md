# Gap Analysis: Refresh Token による自動ログイン

> 入力仕様: `.kiro/specs/refresh-token-auto-login/requirements.md`（requirements-generated / 未承認）
> 分析日: 2026-05-22 / 言語: ja

## 1. Analysis Summary

- **本機能は既存 Auth ドメイン（`backend/src/auth/`）の純粋拡張で収まり、新規ドメインモジュールは不要**。`JwtTokenService` への発行・検証メソッド追加 + 永続層 1 テーブル追加 + `/auth/refresh` `/auth/logout` の実装 + FE `apiClient` の 401 リフレッシュ層追加が中核となる。
- 一方で **Cookie 周りのインフラが現状ほぼ存在しない**: `cookie-parser` 未導入、`@Res()` でレスポンス Cookie を出す経路は X OAuth の `express-session` 以外にゼロ、CORS は `credentials: true` 済みだが `SameSite=None; Secure` 構成での実機検証は未実施。ここが最大の研究対象。
- **CLAUDE.md / steering の主張と実装が一部ズレており要注意**: 「グローバル JWT Guard + `@Public()` opt-out」と書かれているが、実態は `APP_GUARD` に `ThrottlerGuard` しか登録されておらず、`JwtAuthGuard` は各 Controller / メソッドの `@UseGuards()` で個別適用されている（`app.module.ts:42-46`）。`/auth/refresh` を保護対象外にする方法も「`@Public()` を付ける」ではなく「`@UseGuards(JwtAuthGuard)` を付けない」になる。Requirement 2.7 の文言は実装時に合わせて再確認する必要あり。
- **Reuse detection（4.4）と Token Family 概念は新規パターン**。既存のテストパターン（`auth.service.spec.ts` / `jwt.service.spec.ts`）を踏襲しつつも、ローテーション系列の状態遷移を表現するモデル設計が新規論点。
- **frontend `apiClient.request()` は単純な await fetch で、401 リトライ・並行リクエスト集約・refresh Promise 共有のいずれも未実装**（`frontend/src/utils/api.ts:49-94`）。透過的リフレッシュは新規パターンの導入になる。

**推奨アプローチ**: 既存 Auth モジュール「拡張」(Option A) を主軸とし、Frontend 側の透過リフレッシュ層だけ「新規ユーティリティ」(Option B) として切り出すハイブリッド（Option C）。Effort: **L（1〜2 週間）**、Risk: **Medium**。

---

## 2. Current State Investigation

### 2.1 Auth ドメイン構成（バックエンド）

| 役割                    | 既存ファイル                                                                                                | 状態                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access Token 発行       | `backend/src/auth/jwt.service.ts:23-27` (`generateTokens`)                                                  | TTL は `JWT_EXPIRATION`（既定 `24h`）。`AuthTokens.refreshToken?` フィールドは型に存在するが返却していない                                              |
| Email/Password ログイン | `backend/src/auth/auth.service.ts:109-113` (`login`)                                                        | `jwtTokenService.generateTokens` を呼んで access のみ返却                                                                                               |
| OAuth ログイン          | `backend/src/auth/oauth.service.ts:80, 125`（`handleOAuthLogin` / `handleOAuthRegistrationWithInvitation`） | 同上、access only                                                                                                                                       |
| OAuth コールバック完了  | `backend/src/auth/auth.controller.ts:69-74` (`handleOAuthCallback`)                                         | `configService.generateSuccessRedirectUrl(accessToken, user)` で **URL クエリに access token を載せて 302 リダイレクト**（`config.service.ts:159-161`） |
| Logout                  | `backend/src/auth/auth.controller.ts:132-140`                                                               | サーバー側は **完全ノーオペ**（コメント "JWTはステートレス" あり）。クライアント側のローカル削除のみ                                                    |
| パスワード変更          | `backend/src/auth/auth.controller.ts:206-248`                                                               | パスワード更新のみ。トークン失効処理なし                                                                                                                |
| Guard                   | `backend/src/auth/jwt-auth.guard.ts`                                                                        | `AuthGuard('jwt')` + `@Public()` 判定で skip。Controller 単位の `@UseGuards()` で適用                                                                   |
| 認証エラーコード        | `backend/src/common/exceptions/error-codes.ts:14-24` (`ERROR_CODES.AUTH`)                                   | `AUTH001`〜`AUTH009`。Refresh 系コード未定義                                                                                                            |
| Throttler               | `backend/src/config/auth-constants.ts:27-45`                                                                | `REGISTER` / `LOGIN` のみ。`REFRESH` 設定なし                                                                                                           |

### 2.2 Frontend 認証層

| 役割                   | 既存ファイル                                                                                | 状態                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Access Token 保管      | `frontend/src/utils/auth.ts:45-83` (`AuthTokenManager`)                                     | `localStorage` の `auth_access_token` キーのみ                                                |
| API リクエスト         | `frontend/src/utils/api.ts:29-94` (`ApiClient.request`)                                     | `Bearer` 付加。**401 リトライ・refresh 連鎖・並行集約はゼロ**。`credentials` も指定なし       |
| OAuth コールバック処理 | `frontend/src/hooks/useOAuth.ts:122-159`                                                    | URL クエリの `token` を `localStorage` に保存                                                 |
| 初期化                 | `frontend/src/contexts/AuthContext.tsx:94-122` + `frontend/src/hooks/useEmailAuth.ts:74-84` | localStorage の access token を確認 →`/auth/me` で復元。**Refresh 経路なし**                  |
| ローディング表示       | `AuthContext.tsx:113-118` (`setLoading(false)` for 終端)                                    | `AuthState.loading` フラグあり。AuthGuard で `loading` 中はガード判定を保留する想定（要確認） |
| API client 認証要件    | `getAuthHeaders` の `AuthLevel` (`REQUIRED` / `OPTIONAL` / `NONE`)                          | 401 を呼び出し元に投げて終わる                                                                |

### 2.3 永続層

`backend/prisma/schema.prisma:136-160` の `User` モデルには OAuth 各 ID (`oauthId` / `lineId` / `appleId` / `xId`) があるが、**Refresh Token を保持するモデルは未定義**。`@@map("users")` の単一テーブルに認証情報を持つ既存パターンを踏襲するなら、新規 `RefreshToken` モデルが必要。

### 2.4 横断インフラ

- **CORS**: `backend/src/main.ts:50-54` で `enableCors({ credentials: true, methods: [GET, POST, PUT, PATCH, DELETE] })`。**`OPTIONS` プリフライト明示なし**（NestJS / Express がデフォルトで返す前提）。`SameSite=None` Cookie を本番（`mosaku.jp` ↔ Cloud Run）でやり取りするには十分。
- **Cookie ライブラリ**: `cookie-parser` / `cookie` パッケージは backend `package.json` に未導入。`express-session` だけが入っているが用途は X OAuth state 用。**Refresh Token Cookie のために `cookie-parser` 追加が必要**。
- **Helmet**: `main.ts:21-32` で CSP 設定済み、`crossOriginEmbedderPolicy: false`（OAuth のため）。Cookie 周りの追加対応は不要。
- **Sentry**: `backend/src/common/sentry/sentry-tags.ts:33` で `/auth` パスは `feature_area: 'auth'` に自動分類済み → Requirement 7.1 はタグ付け既存仕組みに乗る。
- **Sentry Scrubber**: `backend/src/common/sentry/sentry-scrubber.ts:11` で `refreshToken` は既にリダクション対象キーに含まれる ✅ → Requirement 7.2 の PII 規約に既に整合。
- **Throttler**: `@nestjs/throttler` を `app.module.ts` で `APP_GUARD` 登録済み + `@Throttle()` デコレータで上書き可能 → Requirement 7.3 は既存パターンで対応可。

### 2.5 ⚠️ 重要なズレ: 「グローバル JWT Guard」は実装されていない

- `CLAUDE.md` / `tech.md` に「**グローバル JWT Guard + `@Public()` opt-out**」と明記されているが、実体は `app.module.ts:42-46` を見る限り `APP_GUARD = ThrottlerGuard` のみ。
- `JwtAuthGuard` は `memo.controller.ts:22` / `notebook.controller.ts` / `auth.controller.ts` 各メソッドの `@UseGuards(JwtAuthGuard)` で **個別適用**されている。
- 影響:
  - Requirement 2.7「`/auth/refresh` を `@Public()` でグローバル JWT Guard の対象外とし、Access Token なしで呼び出せるようにする」→ 文言修正対象。実装は `@UseGuards(JwtAuthGuard)` を付けないだけで OK（既存 `@Public()` ハンドラ群と同じ扱い）。
  - 将来の整合性のためにこのタイミングで真のグローバル化（`{ provide: APP_GUARD, useClass: JwtAuthGuard }`）を検討するか、それともズレを記述だけ直すかは設計フェーズで決定。

---

## 3. Requirement-to-Asset Map（Gap 分類）

| Req      | 要件サマリ                                                               | 既存資産                                                                                      | Gap タグ                                                                                                                            |
| -------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1.1〜1.3 | Email / OAuth / 招待新規登録の全経路で AT+RT を発行                      | `AuthService.login` / `OAuthService.handle*` / 招待版メソッド群（5 プロバイダ × 2 = 10 経路） | **Missing**: RT 発行ロジック / Cookie セット                                                                                        |
| 1.4      | RT 生平文を保存せずハッシュのみ                                          | `bcrypt`（既存利用）or `crypto.createHash('sha256')`（Node 標準）                             | **Missing**: RT 用ハッシュアルゴリズム選定（**Research Needed**: bcrypt は重い・SHA-256 + ペッパー or HMAC か）                     |
| 1.5      | RT レコードに userId / 発行時刻 / 失効時刻 / 状態 / 最終使用 / IP・UA    | Prisma `User` モデル + Express `req.ip` / `req.headers['user-agent']`                         | **Missing**: `RefreshToken` モデル新規追加（マイグレーション）                                                                      |
| 1.6      | TTL を env で変更可能                                                    | `auth-constants.ts:JWT_EXPIRATION` 既存パターン                                               | **Missing**: `REFRESH_TOKEN_EXPIRATION` 定数                                                                                        |
| 1.7      | 発行失敗時はログイン全体失敗                                             | Prisma トランザクション（`prisma.$transaction`）                                              | **Constraint**: AT 発行（同期 JWT.sign）と RT 永続化（DB）の順序設計に注意                                                          |
| 2.1〜2.3 | `/auth/refresh` 実装 + ローテーション + 不正時 401                       | `auth.controller.ts` パターン                                                                 | **Missing**: エンドポイント・サービスメソッド                                                                                       |
| 2.4〜2.6 | 透過リフレッシュ・並行集約・失敗時ログアウト                             | `frontend/src/utils/api.ts`                                                                   | **Missing**: refresh promise singleton / 401 interceptor 層                                                                         |
| 2.7      | `/auth/refresh` を Guard 対象外                                          | `@Public()` デコレータ                                                                        | **Constraint**: 上記 2.5 のズレに留意                                                                                               |
| 3.1〜3.4 | 起動時自動ログイン復元 + ロード表示 + 失敗時クリア                       | `AuthContext.useEffect` / `AuthState.loading`                                                 | **Missing**: refresh 呼び出しの組み込み                                                                                             |
| 3.5      | Sentry `feature_area: 'auth'` で成功/失敗トレース                        | `sentry-tags.ts` `resolveFeatureArea`                                                         | ✅ 既存 / **Missing**: FE 側の breadcrumb 仕込み                                                                                    |
| 4.1〜4.3 | logout で RT revoke / FE クリア / revoked 再使用 401                     | `auth.controller.ts:132-140`（現状ノーオペ）                                                  | **Missing**: ステートフル logout 実装                                                                                               |
| 4.4      | rotated 再使用 = 系列全 revoke + Sentry warning                          | Token family 概念                                                                             | **Missing**: `familyId` 列 + reuse 検知ロジック（**新規パターン**）                                                                 |
| 4.5      | パスワード変更時に全 RT revoke                                           | `auth.controller.ts:206-248`                                                                  | **Missing**: 変更成功時の `prisma.refreshToken.updateMany({ where: { userId }, data: { status: 'revoked' } })`                      |
| 5.1〜5.3 | HttpOnly / Secure / SameSite=None / Path=/auth Cookie + CORS credentials | `cookie-parser` 未導入 / `enableCors({ credentials: true })` ✅                               | **Missing**: `cookie-parser` + `@Res()` で cookie 設定 / **Research Needed**: Vercel `mosaku.jp` ↔ Cloud Run の Set-Cookie 実機検証 |
| 5.4〜5.5 | FE は RT を JS から触らない / `credentials: 'include'`                   | `apiClient.request`                                                                           | **Missing**: `credentials: 'include'` 追加（少なくとも `/auth/refresh` / `/auth/logout`）                                           |
| 5.6      | env で Cookie ドメイン / SameSite 切替                                   | `config.service.ts` 既存 getter パターン                                                      | **Missing**: `REFRESH_COOKIE_DOMAIN` / `REFRESH_COOKIE_SAMESITE` env                                                                |
| 6.1      | AT 既定 TTL を 15min                                                     | `auth-constants.ts:JWT_EXPIRATION = '24h'`                                                    | **Missing**: 既定値変更（破壊的変更注意）                                                                                           |
| 6.2      | `JwtStrategy` を維持                                                     | `jwt.strategy.ts` 変更不要                                                                    | ✅                                                                                                                                  |
| 6.3      | 旧 AT（TTL 24h）も exp まで受理                                          | JwtStrategy `ignoreExpiration: false` は exp までは受理する既定挙動                           | ✅ 既存仕様で満たす（特別な互換処理不要）                                                                                           |
| 6.4      | レスポンスから access token が来た場合は localStorage 保持を継続         | `AuthAPI.login` / `AuthTokenManager.setAccessToken`                                           | ✅ 維持。RT は **レスポンス JSON に絶対含めない**ことだけ守る                                                                       |
| 7.1      | Sentry `feature_area: 'auth'` で全 refresh イベント                      | `sentry-tags.ts`                                                                              | ✅ 自動分類                                                                                                                         |
| 7.2      | RT 平文 / ハッシュ / JWT を Sentry に出さない                            | `sentry-scrubber.ts` `refreshToken` リダクション済                                            | ✅ + **Constraint**: RT ハッシュ列のキー名は `tokenHash` 等にしてスクラバ漏れに注意                                                 |
| 7.3      | `/auth/refresh` レート制限                                               | `THROTTLE_CONFIG` パターン                                                                    | **Missing**: `REFRESH` エントリ                                                                                                     |
| 7.4      | `ERROR_CODES.AUTH.REFRESH_*` 追加                                        | `error-codes.ts`                                                                              | **Missing**: `REFRESH_TOKEN_EXPIRED` / `REFRESH_TOKEN_REUSED` / `REFRESH_TOKEN_REVOKED`                                             |
| 7.5      | FE refresh 失敗時の Sentry breadcrumb                                    | `@sentry/react` 既存（`useSentryAuthSync.ts`）                                                | **Missing**: `Sentry.addBreadcrumb` 呼び出し追加                                                                                    |
| 8.1〜8.4 | 単体 / 統合 / E2E テスト                                                 | Jest + Supertest（既存）、Vitest（既存）                                                      | ✅ パターン確立済み                                                                                                                 |
| 8.5      | 機能フラグなしで常時 ON デプロイ                                         | `features.config.ts` 既存だが本機能は対象外                                                   | ✅                                                                                                                                  |

---

## 4. Implementation Approach Options

### Option A: 既存 AuthModule を拡張（推奨主軸）

**範囲**: `backend/src/auth/` 内で完結。`jwt.service.ts` に refresh 系メソッド追加、`auth.service.ts` / `oauth.service.ts` の発行経路で RT も発行、`auth.controller.ts` に `/auth/refresh` / 拡張 `/auth/logout` を追加。

**変更ファイル想定**:

- `backend/src/auth/jwt.service.ts`（`generateRefreshToken` / `verifyRefreshToken` / `rotateRefreshToken` 追加 → ファイルが現状 28 行と非常に薄いので 100 行程度に膨らんでも単一責務維持可）
- `backend/src/auth/auth.service.ts`（`login` の返却型に `refreshToken` 追加 + cookie 設定責務はコントローラへ委譲）
- `backend/src/auth/oauth.service.ts`（同上 × 5 プロバイダ）
- `backend/src/auth/auth.controller.ts`（`/auth/refresh` / `/auth/logout` の実装 + `handleOAuthCallback` で cookie を `res.cookie()` してから redirect）
- `backend/prisma/schema.prisma`（`RefreshToken` モデル追加）+ マイグレーション 1 本
- `backend/src/config/auth-constants.ts`（`JWT_EXPIRATION` 既定 `15m` 化 + `REFRESH_TOKEN_EXPIRATION` 追加 + `THROTTLE_CONFIG.REFRESH`）
- `backend/src/config/config.service.ts`（`refreshCookieDomain` / `refreshCookieSameSite` getter 追加）
- `backend/src/common/exceptions/error-codes.ts`（`AUTH010〜` 追加）
- `backend/src/main.ts`（`cookie-parser` ミドルウェア追加）

**Trade-offs**:

- ✅ AuthModule 内に責務凝集 / steering の `AuthService` / `JwtTokenService` / `OAuthService` 三分割と整合
- ✅ Sentry tags / Throttler / Scrubber が既存パターンでそのまま機能
- ❌ `jwt.service.ts` が「発行のみ」から「永続層 (`PrismaService` を注入) 」に責務拡張。**`JwtTokenService` に Prisma を持ち込むことの是非**は設計フェーズ要決議（Option B 候補に絡む）
- ❌ `auth.service.ts` / `oauth.service.ts` 双方の発行経路を漏れなく書き換える必要（10 経路）

### Option B: `RefreshTokenService` を新規分離

**範囲**: Auth ドメイン内に **新規** `backend/src/auth/refresh-token.service.ts` を作り、`JwtTokenService` は AT 発行のみに留め、RT の永続化・ローテーション・revoke・reuse 検知をすべて新サービスへ。`AuthController` から両サービスを協調的に呼ぶ。

**Trade-offs**:

- ✅ 単一責任が綺麗 / Token family 概念 / DB 操作が独立ファイルにまとまり可読性高
- ✅ テスト面で reuse detection など複雑分岐を新ファイルだけで網羅できる
- ❌ ファイル数が増える / `AuthService.login` のシグネチャは Option A と大差なし
- ❌ 既存 `JwtTokenService` の `AuthTokens.refreshToken?` 型をどちらが返すか責務分担が要設計

### Option C: ハイブリッド（推奨）

**Backend**: Option A 寄りで `JwtTokenService` に **発行 + 検証** のみ追加、**永続化** (`prisma.refreshToken.*`) は新規 `RefreshTokenRepository`（薄い CRUD ラッパー）に分離。`JwtTokenService.generateTokens` は AT のみを返し続け、新規 `RefreshTokenService.issue(userId, ip, ua) → { token, hashed, expiresAt }` を `AuthService.login` / `OAuthService.handleOAuthLogin` から呼ぶ。

**Frontend**: 「新規」アプローチを取る — `frontend/src/utils/api/refreshClient.ts` を新設し、`apiClient.request()` から薄く呼び出す形で 401 interceptor + refresh promise singleton を担当させる。`AuthTokenManager` は AT のみ管理を維持。

**Trade-offs**:

- ✅ 既存責務分離（`AuthService` / `JwtTokenService` / `OAuthService`）の意図を尊重
- ✅ Frontend の透過リフレッシュは独立モジュール化することでテスト容易（Vitest で fetch をモック化）
- ✅ DB 詳細を `JwtTokenService` から隔離できる
- ❌ 設計コストが Option A より若干上がる / レビュー量も増える

---

## 5. Research Needed（設計フェーズに持ち越す論点）

1. **RT ハッシュアルゴリズム選定**: bcrypt（既存・遅い・1 トークンに 1 検証なので許容範囲か？）vs HMAC-SHA256 + `JWT_SECRET` ペッパー（高速・rainbow table 耐性 OK）vs Argon2（追加依存）。`/auth/refresh` のレイテンシ目標を踏まえて選ぶ。
2. **Token Family / 系列 ID の設計**: `familyId` 列を持つ単純な系列管理 vs 親子チェーン（`parentId` 自己参照）。reuse 検知時に「同一系列を全 revoke」する SQL が `updateMany({ where: { familyId } })` で済むのは前者。
3. **Cookie Path スコープ**: `Path=/auth` だと FE が `/auth/refresh` 以外（例: `/memos`）を叩く時に Cookie が同送されない → access token は引き続き `Authorization` ヘッダ運用なら問題なし。`/auth/me` 等の通常 API でも Cookie が要るシナリオが将来あるかを事前確認。
4. **SameSite=None + Cross-site の本番検証**: Vercel `mosaku.jp` ↔ Cloud Run（`api.mosaku.jp` 想定？それとも別ドメイン？）の構成で Chrome / Safari / Firefox の Cookie 受理挙動を実機確認。同じ親ドメイン下なら `SameSite=Lax` で済む可能性も。
5. **OAuth コールバック → Cookie 設定の互換**: 現状の `res.redirect(generateSuccessRedirectUrl(...))` は **アクセストークンを URL クエリ**で渡している。新方式では「RT は Cookie、AT は URL クエリ継続」or「両方 Cookie」or「両方ポストメッセージ経由」のいずれを取るか。**特に Apple OAuth は POST callback** (`auth.controller.ts:445-458`) なので Cookie 設定の挙動を要確認。
6. **CSRF 対策**: `SameSite=None` Cookie は CSRF 攻撃面が広がる。`/auth/refresh` を POST + custom header 必須にする / double-submit cookie パターン / `csrf` library 導入の三択。`@nestjs/throttler` レート制限と組み合わせれば実質的なリスクは低いが、設計判断としては明示が必要。
7. **既存 24h AT を発行済みユーザーの取り扱い**: 6.3 で「exp まで受理」とあるが、リリース時点で AT を持っている全ユーザーは初回 401 まで refresh エンドポイントを呼ばない（Cookie がないため）→ exp 切れ後にログイン画面へ送られる。これは仕様通り / 周知が必要かの判断。
8. **デバイス系列の表現**: 4.4 の「同一ユーザーの当該デバイス系列」をどう識別するか。`familyId` で十分なのか UA フィンガープリント追加かは要設計。

---

## 6. Effort & Risk

| 項目       | 評価              | 根拠                                                                                                                                                                                                                                                                                                      |
| ---------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Effort** | **L (1〜2 週間)** | Backend: マイグレーション + 3 サービス改修 + 1 新規 service + 10 発行経路書き換え + テスト約 15 ケース。Frontend: refresh client 新規 (約 200 行) + `apiClient` 401 経路 + 既存 401 ハンドリングのリファクタ + Vitest テスト 10〜15 ケース。E2E 1 シナリオ。Cookie 周りの環境別検証作業が地味に時間を食う |
| **Risk**   | **Medium**        | 認証経路全書き換えは破壊リスク中。Cookie / CORS / SameSite は本番でしか挙動が完全には検証できないため、Preview 環境での実機確認が品質を左右する。reuse detection は新規パターンだが既存のテストパターンで網羅可能                                                                                         |

---

## 7. 推奨事項（Design フェーズへの引き継ぎ）

1. **アプローチ**: **Option C（Hybrid）** を採用。Backend は `RefreshTokenService` + `RefreshTokenRepository` を新規追加し、`JwtTokenService` は AT 発行 / 検証のみに専念させる。Frontend は `refreshClient.ts` を新規追加して `apiClient` から薄く呼ぶ。
2. **steering の整合性**: 「グローバル JWT Guard」記述と実装ズレを Design フェーズで決着 — (a) 文言を実態に合わせるか (b) このタイミングで真のグローバル化（`{ provide: APP_GUARD, useClass: JwtAuthGuard }`）に揃えるか。本仕様の Requirement 2.7 文言も連動。
3. **マイグレーション戦略**: 1 本のマイグレーションで `RefreshToken` テーブル新規追加。`User.id` への CASCADE 削除を含める（ユーザー削除時の整合性）。インデックスは `(userId, status)` と `(hashedToken)` を最低限。
4. **環境変数追加**: `JWT_EXPIRATION` を `15m` に既定変更、新規 `REFRESH_TOKEN_EXPIRATION=30d` / `REFRESH_COOKIE_DOMAIN` / `REFRESH_COOKIE_SAMESITE` / `REFRESH_COOKIE_SECURE`。`.env.example` 更新を忘れずに。
5. **テスト戦略**: TDD で `RefreshTokenService.issue / rotate / revoke / detectReuse` の 4 メソッドを spec ファースト → Controller `/auth/refresh` の Supertest E2E → Frontend `refreshClient` の Vitest（fetch mock）の順。既存 `auth.controller.spec.ts` / `jwt.service.spec.ts` / `oauth.service.spec.ts` の互換性維持を CI で担保（Requirement 8.3）。
6. **Sentry 観測**: 既存スクラバ / タグ仕組みでカバーされる。`/auth/refresh` の reuse 検知時のみ `Sentry.captureMessage('refresh_token_reuse_detected', { level: 'warning', tags: { feature_area: 'auth' } })` を明示的に出す（Requirement 7.1 + 4.4）。
7. **設計フェーズの優先論点**: 5.1（ハッシュ方式）→ 5.5（OAuth callback の Cookie 互換）→ 5.6（CSRF）の順で議論しないと先に進めない。それ以外は実装時に決められる。
