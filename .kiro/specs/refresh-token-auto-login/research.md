# Research & Design Decisions — Refresh Token による自動ログイン

---

## Summary

- **Feature**: `refresh-token-auto-login`
- **Discovery Scope**: Complex Integration（既存 Auth ドメインの拡張だが、永続層・Cookie インフラ・FE 透過リフレッシュの 3 領域に同時並行で踏み込む）
- **Key Findings**:
  - **アーキ方針は Hybrid (gap-analysis Option C)**: `JwtTokenService` は Access Token (AT) 専任。`RefreshTokenService` + `RefreshTokenRepository` を新規追加し、Refresh Token (RT) の発行・検証・ローテーション・revoke・reuse 検知をここに閉じ込める。Frontend は `refreshClient` 単独モジュールを新設して `apiClient` から薄く呼ぶ。
  - **`grpc グローバル JWT Guard` は実装されていない**（CLAUDE.md / tech.md の記述と実装にズレ）。本仕様で `{ provide: APP_GUARD, useClass: JwtAuthGuard }` を導入して真のグローバル化に揃え、`/auth/refresh` `/auth/logout` `/auth/login` `/auth/register` `/auth/reset-password` `/auth/*/register-with-invitation` `/auth/*/callback` `/auth/apple/callback` は `@Public()` で opt-out する（Requirement 2.7 の文言と実態を一致させる）。
  - **RT ハッシュは HMAC-SHA256 + pepper**。bcrypt は 1 リフレッシュ毎に 100ms 級コストで過剰、Argon2 は新規依存追加が必要。HMAC-SHA256 は決定論的（DB インデックス検索可）かつレインボーテーブル耐性も pepper で確保できる。
  - **Cookie 配信は Lax + Parent Domain を既定、Cross-site 構成だけ env で None に切替**。本番想定 `mosaku.jp` ↔ `api.mosaku.jp` は同一 registrable domain なので `SameSite=Lax; Domain=.mosaku.jp` で済む。Cloud Run 直URL（`*.run.app`）に張り替える場合や Preview 環境では `REFRESH_COOKIE_SAMESITE=none` `REFRESH_COOKIE_DOMAIN=`（空）で切替可能にする。
  - **CSRF 対策は三重防御**: SameSite + Origin ヘッダ検証 + カスタムヘッダ必須（`X-Refresh-Request: 1`）。外部 CSRF ライブラリは v1 では導入しない。

## Research Log

### RT ハッシュアルゴリズム選定

- **Context**: Requirement 1.4 で「RT 生平文を保存せず、暗号学的に安全なハッシュに変換した値のみを保存」とある。`/auth/refresh` はホットパスのため検証レイテンシが直接 UX に響く。
- **Sources Consulted**:
  - OWASP Authentication Cheat Sheet — Token Storage（HMAC + pepper パターン）
  - Auth0 Refresh Token Rotation 解説（ハッシュ保存 + family 検知）
  - 既存 `BCRYPT_SALT_ROUNDS = 12` のレイテンシ（社内計測: 約 80〜120ms / op）
- **Findings**:
  - bcrypt(12) は 1 検証に 80〜120ms。`/auth/refresh` の高頻度ホットパスには重い。
  - HMAC-SHA256 は <1ms / op、決定論的なため `tokenHash` カラムへの一意制約・インデックス検索が成立。
  - pepper（環境変数 `REFRESH_TOKEN_PEPPER`）を別途持つことで、DB 単体漏洩時のレインボーテーブル耐性を確保。`JWT_SECRET` と兼用しない（pepper rotation の独立性確保）。
  - RT 平文は `crypto.randomBytes(32).toString('base64url')` の 256bit 乱数。推測不能性は entropy 256bit で十分。
- **Implications**:
  - DB スキーマ: `tokenHash String @unique`（インデックス検索用、HMAC-SHA256 64hex 文字）
  - 環境変数追加: `REFRESH_TOKEN_PEPPER`（必須・本番起動時に未設定なら fail-fast）
  - Sentry Scrubber 既存リダクション対象（`refreshToken` / `tokenHash` キー名）に従う

### Token Family と Reuse 検知の表現

- **Context**: Requirement 4.4 で「rotated 済み RT が再使用された場合、同一系列を全 revoke + Sentry 警告」とある。系列をどう表現するか。
- **Sources Consulted**:
  - OAuth 2.0 Best Current Practice (RFC 9700) §4.13 Refresh Token Protection
  - Auth0 ドキュメント "Refresh Token Rotation: Automatic Reuse Detection"
- **Findings**:
  - 候補 1: **`familyId` UUID 列** — ローテーションで親子は同じ familyId を継承。reuse 検知時は `updateMany({ where: { familyId, status: { in: ['active', 'rotated'] } } })`。SQL がフラット 1 クエリで済む。
  - 候補 2: `parentId` 自己参照 — 親子チェーンを CTE で辿る。深さ依存で複雑。
- **Implications**:
  - **採用: familyId UUID 列**。新規ログイン時に `randomUUID()` 採番、ローテーション時に親の familyId を継承。
  - Index: `(familyId)` 単独 +`(userId, status)` 複合の 2 本。

### Cookie Path スコープと AT 配送経路

- **Context**: Requirement 5.2「`Path=/auth` 等の最小スコープ」+ Requirement 5.4「FE は RT 文字列を JS から触らない」+ 既存 AT は `Authorization: Bearer` ヘッダで `/memos` 等を呼んでいる。
- **Findings**:
  - **RT Cookie: `Path=/auth`** — `/auth/refresh` と `/auth/logout` のみ送出される。`/memos` などのドメインメインフローには同送されないので、CSRF 攻撃面が縮む。
  - **AT: `Authorization: Bearer` ヘッダ維持** — 既存パターン踏襲、`apiClient` 改修最小化（Requirement 6.4 互換性）。
  - **`/auth/me` の取り扱い**: 現在は Bearer のみ。RT 配送経路には含めず、AT 切れ時は `apiClient` 401 interceptor → `/auth/refresh` → 再試行で復帰する。
- **Implications**:
  - Cookie 配置スコープを `Path=/auth` に固定する（環境変数化はしない、ハードコード）。
  - `/auth/me` を含む `/auth/*` 配下も Cookie が同送されるが、サーバ側で Cookie を読むのは `/auth/refresh` `/auth/logout` のみに限定する（Cookie 存在の有無で挙動を分岐させない）。

### SameSite / Domain / 本番クロスドメイン構成

- **Context**: Requirement 5.2 で `SameSite=None` 明記。だが production の `mosaku.jp` ↔ `api.mosaku.jp` の同一 registrable domain 構成なら `Lax` で十分かつ CSRF 面が狭まる。
- **Sources Consulted**:
  - MDN Set-Cookie SameSite 仕様
  - Chrome SameSite=Lax 既定化以降の cross-site cookie 配送挙動
  - 既存 `corsOrigins` env（`backend/src/config/config.service.ts`）
- **Findings**:
  - **同一 registrable domain ケース (`mosaku.jp` ↔ `api.mosaku.jp`)**: `SameSite=Lax; Domain=.mosaku.jp; Secure; HttpOnly; Path=/auth` で送信成立。CSRF 攻撃面は通常リンク経由のみ。
  - **Cross-site ケース (Vercel Preview URL + Cloud Run `*.run.app` 等)**: `SameSite=None; Secure; HttpOnly; Path=/auth`、`Domain` 属性なし。本番からの転用時には CSRF 三重防御（SameSite=None + Origin 検証 + カスタムヘッダ）必須。
- **Implications**:
  - 環境変数: `REFRESH_COOKIE_DOMAIN`（任意。空文字なら Domain 属性付与なし）、`REFRESH_COOKIE_SAMESITE`（`lax | none`、既定 `lax`）、`REFRESH_COOKIE_SECURE`（`true | false`、既定 `true`、ローカル HTTP では `false` 許容）。
  - Requirement 5.3 の CORS `credentials: true` は既存 `main.ts:55` に既設定 ✅。
  - Production の `mosaku.jp` 構成では Lax で運用 → CSRF 軽減と運用簡素化の両得。

### OAuth コールバックの Cookie 設定タイミング

- **Context**: Requirement 1.2 で OAuth ログインも AT+RT 両方発行。現状の OAuth コールバックは `res.redirect(generateSuccessRedirectUrl(accessToken, user))` で URL クエリに AT を載せている。
- **Findings**:
  - `res.cookie('refresh_token', plainRt, {...cookieOpts}); res.redirect(redirectUrl);` の順序で OK（Set-Cookie ヘッダ + 302 Location は併存可能、ブラウザは両方処理）。
  - **Apple OAuth は POST callback (`@Post('apple/callback')`)** — 通常のブラウザ form POST → 302 redirect 経路。Set-Cookie は同様に動作する（標準的なブラウザ挙動）。
  - **AT は URL クエリ継続**（v1 では既存挙動を維持して破壊的変更を抑制）。Requirement 6.4「レスポンスから access token が返却された場合は従来通り localStorage に保持」と整合。
- **Implications**:
  - 新規ヘルパー `setRefreshCookie(res, plainRt)` を `AuthController` に private メソッドで追加。全 OAuth コールバック (`handleOAuthCallback`) + Email login + 5 つの `register-with-invitation` で共通利用。

### CSRF 対策の設計

- **Context**: `SameSite=None` 運用時に CSRF 攻撃面が広がる。`/auth/refresh` は RT Cookie を取って AT を発行するので、CSRF で叩かれると攻撃者は AT を直接取れないが、被害者の AT を意図せずローテートできてしまう（UX 破壊・DoS）。
- **Findings**:
  - 候補 1: double-submit cookie（追加 cookie + body / header の値一致検証）
  - 候補 2: 専用ヘッダ要求（`X-Refresh-Request: 1` 等のカスタムヘッダ、CORS preflight で保護）
  - 候補 3: Origin / Referer ヘッダ検証
  - **採用: 三重防御** — (a) `SameSite` 既定 Lax、(b) `Origin` が `corsOrigins` に含まれることを `/auth/refresh` `/auth/logout` で検証、(c) カスタムヘッダ `X-Refresh-Request: 1` 必須。
- **Implications**:
  - `@nestjs/throttler` のレート制限（`REFRESH: { LIMIT: 10, TTL: 60_000 }`）と組み合わせて、CSRF + ブルートフォース両方を緩和。
  - 別ライブラリ（`csurf` 等）の導入は不要 — メンテナンス停止済みのものが多く、独自実装でカバーできる。

### 既存 24h Access Token を保持しているユーザーの取り扱い

- **Context**: Requirement 6.3 で「リリース直後の旧 AT は exp まで有効として受理」とある。リリース時点で生きている AT を持つユーザーが、AT 期限内に再訪しない場合の挙動は？
- **Findings**:
  - 旧 AT は exp（24h）まで有効。Cookie がないので `/auth/refresh` を叩く経路がない。
  - AT 切れ後の再訪時、`apiClient` の 401 interceptor が `/auth/refresh` を呼ぶが Cookie 不在で 401 → ログイン画面遷移。
  - 影響: ドッグフーディング Phase 1 ユーザー（実質本人 1 名）+ 招待された少数のテスター。1 回だけ再ログインが必要 → 許容範囲。
- **Implications**:
  - 移行戦略は「単一デプロイ + 一度の強制再ログイン」で済む。フィーチャーフラグ不要（Requirement 8.5 と整合）。
  - リリース時の周知（招待ユーザー Slack / メール等）を Implementation 段で別途検討。

### グローバル JWT Guard の真のグローバル化

- **Context**: gap-analysis で「CLAUDE.md / tech.md と実装にズレ」と指摘あり。`/auth/refresh` を `@Public()` で除外するという Requirement 2.7 の文言が、現状の「個別 `@UseGuards()`」実装と噛み合わない。
- **Findings**:
  - 真のグローバル化（`{ provide: APP_GUARD, useClass: JwtAuthGuard }`）に揃える方が、(a) Steering の宣言と実装が一致、(b) 将来の Controller 追加時に `@Public()` 漏れによる**意図せず公開**事故が起きない、(c) `@Public()` opt-out の判定ロジック（`Reflector.getAllAndOverride()`）は既に `JwtAuthGuard` で実装済み。
  - 影響範囲: 既存全 Controller 確認 — 各 protected メソッド（`@UseGuards(JwtAuthGuard)`）から `@UseGuards` を外せる（任意・将来作業）。本仕様では **新規追加** のみグローバル化に乗せ、既存 `@UseGuards()` は段階的に削除でも可。
  - 公開エンドポイント inventory: `/health`, `/auth/login`, `/auth/register`, `/auth/logout`, `/auth/reset-password`, `/auth/refresh`（新規）, `/auth/*/callback`（5 プロバイダ）, `/auth/*/register-with-invitation`（5 プロバイダ）, `/theme/system/list`, `/theme/public/list`, `/invitation/verify` → 全て `@Public()` 付与済 or 付与対象。
- **Implications**:
  - `app.module.ts:providers` に `{ provide: APP_GUARD, useClass: JwtAuthGuard }` を追加。
  - 既存 `@UseGuards(JwtAuthGuard)` を残しても重複ガードはエラーにならない（NestJS は同一クラスのガードを 2 回 canActivate しない仕様ではないが、`JwtAuthGuard` は冪等なので問題なし）。
  - `JwtStrategy.validate()` の戻り値が `req.user` に乗る既存挙動は維持。
  - Requirement 2.7 はこの設計で文言どおりに成立する。

## Architecture Pattern Evaluation

| Option                              | Description                                                                                                 | Strengths                                                                                                                                           | Risks / Limitations                                                 | Notes                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| A: AuthModule 直接拡張              | `JwtTokenService` に RT 発行/検証/ローテーションを追加し、Prisma も注入                                     | 変更ファイル数最小 / レビュー量小                                                                                                                   | `JwtTokenService` の責務が「JWT 発行」から「JWT + RT 永続化」に肥大 | gap-analysis Option A                      |
| B: `RefreshTokenService` を完全分離 | RT 関連（発行・検証・ローテ・revoke・reuse 検知・Cookie 操作）を新サービスに集約                            | 単一責任 / テスト容易                                                                                                                               | `AuthService.login` / `OAuthService.*` の協調呼び出しが増える       | gap-analysis Option B                      |
| C: Hybrid（採用）                   | `RefreshTokenService` + `RefreshTokenRepository`（Prisma ラッパー）を新規。`JwtTokenService` は AT 専任継続 | 既存責務分離（Auth / Jwt / OAuth 三分割）の意図を尊重 / Token Family ロジックを 1 ファイルに凝集 / FE refresh client も独立モジュール化でテスト容易 | 設計コスト・レビュー量 中                                           | gap-analysis Option C と一致、本仕様で採用 |

## Design Decisions

### Decision: Refresh Token ハッシュは HMAC-SHA256 + pepper

- **Context**: `/auth/refresh` がホットパスで、bcrypt(12) の 80〜120ms 検証は UX 上許容できない。同時に DB 単体漏洩時のレインボーテーブル耐性も要求される。
- **Alternatives Considered**:
  1. bcrypt(12) — 既存パターン踏襲、安全だが遅い
  2. Argon2id — 強力だが新規依存追加
  3. HMAC-SHA256 + 環境変数 pepper — 高速かつ pepper 漏洩なしならレインボー耐性 OK
- **Selected Approach**: `crypto.createHmac('sha256', REFRESH_TOKEN_PEPPER).update(plainRt).digest('hex')` の決定論的 hash を `tokenHash` 列に保存。検索は `where: { tokenHash }`。
- **Rationale**: 1ms 未満で検証完了 / 決定論的なので index 一致検索可能 / pepper を分離保管することで DB 漏洩のみのケースで攻撃成立を防ぐ。
- **Trade-offs**: pepper の管理責務が増える（rotation 計画が必要）。代わりに RT ライフサイクル中の rotation 強制 + 失効 30 日で実害は限定される。
- **Follow-up**: pepper rotation 手順を Implementation Notes に追記する。RT 平文の entropy は `crypto.randomBytes(32)` で 256bit に固定。

### Decision: Token Family は `familyId` UUID 単独列

- **Context**: reuse 検知時に「同一系列を全 revoke」する必要があり、SQL の単純さと将来のデバイス管理 UI への拡張性を両立したい。
- **Alternatives Considered**:
  1. `parentId` 自己参照 — 親子チェーン CTE 検索
  2. `familyId` UUID — フラット集合
- **Selected Approach**: `familyId String @db.Uuid` を全レコードに付与。新規ログイン時 `randomUUID()` 採番、ローテーション後の新規 RT は親と同じ familyId を継承。reuse 検知時 `updateMany({ where: { familyId, status: { in: ['active', 'rotated'] } }, data: { status: 'revoked' } })`。
- **Rationale**: ローテーション chain の状態遷移を 1 行 SQL で表現可能。将来「デバイス一覧表示」UI を追加する際も `groupBy familyId` で簡潔に列挙できる。
- **Trade-offs**: 厳密な親子順序（誰が誰をローテートしたか）は記録しないが、`createdAt` 順で十分復元できる。
- **Follow-up**: なし。

### Decision: Cookie 配送は SameSite=Lax + Parent Domain を既定 / cross-site は env で None 切替

- **Context**: 本番想定 `mosaku.jp` ↔ `api.mosaku.jp` は同一 registrable domain。Lax で十分かつ CSRF 攻撃面が狭まる。一方 Preview や Cloud Run 直 URL では cross-site となり None が必要。
- **Alternatives Considered**:
  1. 一律 `SameSite=None; Secure` — 単純だが CSRF 面常時 open
  2. 一律 `SameSite=Lax` — Preview / cross-origin で動かない
  3. env 切替（採用）
- **Selected Approach**: `REFRESH_COOKIE_SAMESITE`（`lax`(既定) | `none` | `strict`）、`REFRESH_COOKIE_DOMAIN`（空なら Domain 属性なし）、`REFRESH_COOKIE_SECURE`（既定 `true`）を環境変数化。
- **Rationale**: Production の通常運用では CSRF 攻撃面を最小化 / Preview / cross-site では一時的に None 切替 / ローカル HTTP では Secure=false に下げる選択肢を残す。
- **Trade-offs**: env 設定ミスで Cookie が届かないトラブルの可能性 → ローカル `docker-compose` での疎通テスト、Preview 環境での実機検証をタスクに含める。
- **Follow-up**: `.env.example` に Production / Preview / Local の推奨値コメントを書く。

### Decision: CSRF は SameSite + Origin 検証 + カスタムヘッダの三重防御

- **Context**: `SameSite=None` 運用時の CSRF 攻撃面を、外部ライブラリに依存せず防ぎたい。
- **Alternatives Considered**:
  1. `csurf` 等の旧来 lib — 多くがメンテ停止
  2. double-submit cookie — 実装増、cookie 増
  3. SameSite + Origin + custom header（採用）
- **Selected Approach**: `/auth/refresh` `/auth/logout` で (a) Cookie 経由 RT 受領、(b) `Origin` ヘッダが `corsOrigins` に含まれることを検証、(c) `X-Refresh-Request: 1` カスタムヘッダ必須（CORS preflight で保護）。
- **Rationale**: 三重独立条件のため、攻撃成立には Cross-site + Origin spoof + Preflight bypass が同時必要。`@nestjs/throttler` 併用で実害が出る前に止まる。
- **Trade-offs**: FE 側で `apiClient` から `/auth/refresh` 呼び出し時にカスタムヘッダ付与の責務が発生。
- **Follow-up**: Implementation で `refreshClient.ts` のヘッダ設定を統一定義する。

### Decision: APP_GUARD として JwtAuthGuard を真にグローバル化

- **Context**: Steering と実装のズレを今回のタイミングで解消する。`@Public()` opt-out のロジックは既に `JwtAuthGuard` に実装済み。
- **Alternatives Considered**:
  1. Steering 文書を実態（個別 `@UseGuards()`）に合わせる
  2. APP_GUARD としてグローバル化（採用）
- **Selected Approach**: `app.module.ts` の `providers` に `{ provide: APP_GUARD, useClass: JwtAuthGuard }` を追加。既存 `@UseGuards(JwtAuthGuard)` は段階的にクリーンアップ可（本仕様の Tasks には含めない）。`/auth/refresh` `/auth/logout`（新規）+ `/auth/*/callback` `/auth/*/register-with-invitation`（既存）+ 公開エンドポイント全般は `@Public()` 付与済 or 付与対象として明示する。
- **Rationale**: 将来追加される Controller での `@UseGuards` 忘れによる "意図せず公開" 事故をゼロにできる。Requirement 2.7 の文言が実装どおりに通る。
- **Trade-offs**: 全 Controller の `@Public()` 付与漏れチェックが必要（本仕様のタスクに加える）。
- **Follow-up**: 既存公開エンドポイントの inventory は本 research log §「グローバル JWT Guard の真のグローバル化」を参照。Tasks 段で `/auth/refresh` 新設と同時に APP_GUARD 化 + 既存公開ハンドラの `@Public()` 監査を 1 task として組む。

### Decision: AT は localStorage + Authorization ヘッダ継続 / RT は HttpOnly Cookie 専用

- **Context**: Requirement 6.4 で互換性維持が明記。FE の `apiClient` 改修を最小化したい。
- **Selected Approach**: Login/Register/Refresh のレスポンス JSON に `accessToken` を含めて返す（既存維持）。FE は `AuthTokenManager.setAccessToken()` で localStorage 保存（既存維持）。RT は **レスポンス JSON には絶対含めない**、Set-Cookie ヘッダのみで配送。
- **Rationale**: 既存 `apiClient.request()` の `Authorization: Bearer` ロジック改修不要。`/auth/refresh` 呼び出しと 401 interceptor のみ新規実装で済む。
- **Trade-offs**: AT は依然 XSS 被害面（localStorage 露出）に残る。AT 短命化（既定 15 分）で被害ウィンドウを最小化することで補償。
- **Follow-up**: 将来 AT も Cookie 化する余地は残す（Out of Scope）。

## Risks & Mitigations

- **Risk 1: Cookie が本番で届かない / 受け取られない** — Mitigation: `.env.example` 推奨値 + Preview 環境疎通テストを Tasks に明示。実機（Chrome / Safari / Firefox）で 1 回確認。
- **Risk 2: 10 経路（Email + OAuth 5 + 招待新規登録 5）の RT 発行漏れ** — Mitigation: `AuthController.private setRefreshCookie()` を 1 ヶ所に集約 + 各経路の e2e テスト（Login / OAuth Login / Invitation Register × 全 5 プロバイダ）。
- **Risk 3: `JwtAuthGuard` グローバル化で既存公開エンドポイントが 401** — Mitigation: 公開ハンドラ inventory を本 research log §「グローバル JWT Guard の真のグローバル化」に列挙済。Tasks で `@Public()` 監査タスクを 1 件起こす。
- **Risk 4: pepper の運用ミス（未設定 / rotation 失敗 → 全 RT 一括失効）** — Mitigation: 起動時に `REFRESH_TOKEN_PEPPER` 未設定なら fail-fast（production 環境のみ）。`.env.example` で必須マーク。pepper rotation は「全ユーザー再ログイン」運用と理解しておく。
- **Risk 5: `/auth/refresh` への一斉殺到（AT 短命化で一斉に切れる窓）** — Mitigation: `THROTTLE_CONFIG.REFRESH` で per-user rate limit、`@nestjs/throttler` 既存 IP-based throttle と併用。FE の refresh promise singleton で 1 instance 内の多重発火を抑制。

## References

- [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://datatracker.ietf.org/doc/rfc9700/) — §4.13 Refresh Token Protection
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) — Token Storage / Refresh Token Rotation
- [Auth0: Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation) — Token family + automatic reuse detection 解説
- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) — SameSite / Domain / Path / Secure 属性仕様
- gap-analysis.md（`./gap-analysis.md`）— 本仕様の現状調査・Asset Map・実装オプション比較
