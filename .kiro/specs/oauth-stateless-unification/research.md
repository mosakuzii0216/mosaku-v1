# Research & Design Decisions: oauth-stateless-unification

---

**Purpose**: 設計判断の根拠となる discovery 結果・外部依存調査・トレードオフを記録する。`design.md` は本ログの結論を本文へ反映済みであり、本ファイルは背景・証跡用途とする。

---

## Summary

- **Feature**: `oauth-stateless-unification`
- **Discovery Scope**: Complex Integration（既存 OAuth 基盤への暗号処理導入 + X フロー全面差し替え + session 撤去）
- **Key Findings**:
  1. **X の profile 取得が現状コードに存在しない**。`x.strategy.ts` は `userProfile` を override せず、`src/` 全体に `users/me` 相当の呼び出しが無い。X 専用テストは `passport-oauth2` を丸ごと mock し guard を stub するため、本番の profile fetch 経路は一度もテストされていない。→ Option A / B いずれを採っても **X profile fetch は新規実装が必須**。
  2. **X（Twitter）は state パラメータを最大 500 文字に制限**する。暗号化 verifier を state に載せても、コンパクト符号化（短キー JSON + 32 byte verifier）で約 350–380 文字に収まり制限内。
  3. **passport-oauth2 のカスタム StateStore + PKCE 契約は解読済み**（`store(req, verifier, state, meta, cb)` arity 5 / `verify(req, state, meta, cb)` arity 4、verify の第2引数文字列が `code_verifier` になる）。Option A は技術的には実現可能だが、profile fetch を別途要し、passport 内部の arity ディスパッチに密結合し、X だけ他4社と state 機構が割れるため**劣後**。
  4. MCP 認可フロー（`mcp/auth/oauth.controller.ts`）は同一オリジンの短命サーバー状態として cookie-session を正当利用しており、本 spec のスコープ外（cookie-session は MCP 専用へ縮退して残置）。OAuth ログイン側の唯一の session 依存は X のみ。

## Research Log

### Topic 1: passport-oauth2 のカスタム StateStore + PKCE 契約（R-1）

- **Context**: gap-analysis の Option A（passport のカスタム `store` で verifier を暗号化 state に符号化）の採否を決めるため、`code_verifier` の保持/復元タイミングと StateStore の契約を確認する必要があった。
- **Sources Consulted**: `node_modules/passport-oauth2/lib/strategy.js`（v1.8.0、実コード）、`lib/state/pkcesession.js`。
- **Findings**:
  - `options.pkce === true` で `_pkceMethod = 'S256'`。`pkce` 有効時に `state: true` でないと `TypeError('OAuth2Strategy requires state: true option when PKCE is enabled')` を投げる（strategy.js L112）。
  - 認可開始時、passport が `verifier = base64url(randomBytes(32))` を生成し `code_challenge = base64url(sha256(verifier))`、`code_challenge_method` を付与（L238-252）。**verifier 生成は passport 内部**。
  - StateStore の `store` はメソッド arity でディスパッチ（L289-297）。カスタム store + PKCE では **arity 5: `store(req, verifier, state, meta, callback)`** が呼ばれ、`callback(null, handle)` で state 文字列を返す契約。
  - コールバック時は `verify` の arity でディスパッチ（L218-222）。**arity 4: `verify(req, providedState, meta, callback)`**。`callback(err, ok, state)` の **第2引数 `ok` が文字列なら `params.code_verifier = ok`**（L171-172）→ token 交換に使われる。検証失敗は `ok` を falsy にして `fail(403)`。
  - その後 `_oauth2.getOAuthAccessToken` → `_loadUserProfile(accessToken, cb)`（L175-180）。`userProfile` 未 override だと既定は空オブジェクトを返すため `profile.data` は undefined。
- **Implications**: Option A は実現可能。ただし (a) `userProfile` override で X profile fetch を別途実装する必要、(b) verifier は passport が握り、招待コードは別経路（`req`）で controller へ渡す **二重 consumer 構造**、(c) `store.length` / `verify.length` という passport の **内部 arity ディスパッチに密結合**（引数増減で挙動が変わる脆さ）。→ Option B（passport を X から外す）を選好する根拠となった。

### Topic 2: X profile 取得の欠落（発見）

- **Context**: Option B（手組み）の責務見積もりのため、現状 X の profile 取得実装を確認。
- **Sources Consulted**: `src/auth/x.strategy.ts`、`grep -rE "userProfile|users/me|api.twitter"` 全 `src/`、`x.strategy.spec.ts`、`auth.x-flow.integration.spec.ts`。
- **Findings**:
  - `x.strategy.ts` は `tokenURL: https://api.twitter.com/2/oauth2/token` を持つのみ。`userProfile` override も `users/me` 呼び出しも存在しない。
  - `x.strategy.spec.ts` は `jest.mock('passport-oauth2')` で Strategy 自体を差し替え、`validate()` に手書きの `profile.data` を渡してマッピングのみ検証。
  - `auth.x-flow.integration.spec.ts` は `XAuthGuard` / `XRegisterStartGuard` を stub し、`req.user` を直接注入。本番 passport の token 交換・profile fetch は通っていない。
- **Implications**: 本番で `XStrategy.validate(profile)` の `profile.data` は undefined になり得る（X 通常ログインが profile 段で機能しない懸念）。いずれの Option でも **`GET https://api.twitter.com/2/users/me` の明示実装が新規に必要**。Option A の「passport の token 交換を再利用できる」利点は profile fetch 工数で相殺される。

### Topic 3: X OAuth 2.0 token 交換 + profile API（R-2 実装契約）

- **Context**: Option B で X の token 交換・profile 取得を手組みするための正確な契約確認。
- **Sources Consulted**: X/Twitter Developer Platform OAuth 2.0 Authorization Code Flow with PKCE ドキュメント、`x.strategy.ts` 既存定数。
- **Findings**:
  - 認可: `GET https://twitter.com/i/oauth2/authorize`、`response_type=code` / `client_id` / `redirect_uri` / `scope=tweet.read users.read` / `state` / `code_challenge` / `code_challenge_method=S256`。
  - token: `POST https://api.twitter.com/2/oauth2/token`、`application/x-www-form-urlencoded`。**confidential client は `Authorization: Basic base64(client_id:client_secret)`** を付与し、body は `grant_type=authorization_code` / `code` / `redirect_uri` / `code_verifier`。
  - profile: `GET https://api.twitter.com/2/users/me?user.fields=profile_image_url`、`Authorization: Bearer <access_token>`。レスポンス `data: { id, name, username, profile_image_url }`。
- **Implications**: 既存の `XStrategyUser`（`xId/name/username/picture/accessToken`）へ素直にマッピング可能。`XOAuthService` の token/profile 契約を確定（design.md Components 参照）。Node 22+ の組込 `fetch` で実装可能（新規ライブラリ不要）。

### Topic 4: OAuth state パラメータ長制限（R-5）

- **Context**: 暗号化 verifier を state に載せると state が伸びる。各 IdP の上限確認。
- **Sources Consulted**: X API v2 開発者コミュニティ（state 制限）、OAuth WG メーリングリスト、複数プロバイダの実測報告。
- **Findings**:
  - OAuth 2.0 仕様は state 長の上限を定義しない（`1*VSCHAR`）。実務上はブラウザ/サーバ/プロキシの URL 長（~2000–4096 字）が上限。
  - **X（Twitter）は state を最大 500 文字に制限**（過去 100 字との報告もあるが現状 500）。Google/GitHub/LINE/Apple は本ペイロード規模では実質非制約。
  - 本 spec の X state 概算: verifier 32 byte → base64url 43 字 → AEAD 封緘（IV12 + ct + tag16 ≈ 71 byte）→ base64url ≈ 95 字。短キー JSON（`{v,p,c,n,t,ev}`、code 最大 50 字、nonce、iat）≈ 250 字 → base64url ≈ 333 字 + `.` + HMAC base64url 43 字 ≈ **約 377 字 < 500**。
- **Implications**: **コンパクト符号化（短い JSON キー + verifier 32 byte）を必須の設計制約**とする。verifier を 64 byte 等に伸ばすと超過リスク。design.md の State 契約に記載。

### Topic 5: verifier 暗号化方式の選定（R-3 / R-4）

- **Context**: R4.1「改ざんと盗聴の双方を防ぐ認証付き暗号（AEAD）」の具体方式と鍵設計。
- **Sources Consulted**: Node.js `crypto` ドキュメント（`createCipheriv`/GCM）、既存 `InvitationStateService`（HMAC + TTL + fail-fast）、`ConfigService`（`invitationStateSecret` の鍵分離前例）。
- **Findings**:
  - Node 標準 `crypto` の **AES-256-GCM** で AEAD を完結（追加依存なし）。推奨 IV 12 byte（毎回ランダム、鍵との再利用厳禁）、auth tag 16 byte。復号は `decipher.setAuthTag` 後 `final()` が改ざん時に throw（検知 = R2.4）。
  - 鍵は 32 byte。env から hex（64 字）で受領し長さ検証。**署名鍵（`INVITATION_STATE_SECRET`、HMAC）と暗号鍵（新規 `OAUTH_STATE_ENC_KEY`、AEAD）を分離**（鍵用途分離の原則 / R4.2）。
  - 既存 `INVITATION_STATE_SECRET` は fail-fast（未設定で throw）。新鍵も同方針で起動時検知（R4.4）。
- **Implications**: 既存 HMAC 署名エンベロープ（`<b64url(payload)>.<b64url(sig)>`）を維持しつつ、payload JSON に **暗号化 verifier フィールド `ev`（AEAD 封緘）を追加**する最小変更で R2/R4 を満たす。code/provider/iat は秘匿不要のため署名付き平文のまま（HMAC が改ざん防止）。

### Topic 6: MCP cookie-session 結合のスコープ（R-3 確定）

- **Context**: cookie-session を全廃できるかの確認。
- **Sources Consulted**: `mcp/auth/oauth.controller.ts`、`auth.controller.ts:263-273`（`handleOAuthCallback` の mcp ハンドオフ）、`main.ts`（cookie-session ミドルウェア）。
- **Findings**:
  - MCP authorize は `mcpAuthorizeParams` / `mcpUserId` / `mcpAuthorizeReturn` を **同一オリジン（api.mosaku.jp 内のサーバーレンダ HTML フロー）** の短命状態として session に保持。これは session の正当用途。
  - `handleOAuthCallback` は `session.mcpAuthorizeReturn` がある場合のみ `mcpUserId` を注入して MCP authorize へ戻す。MCP login-start は `google/github/line` のみ許可で **X は MCP フローを通らない**。
- **Implications**: cookie-session は **MCP 認可フロー専用へ縮退して残置**（撤去は別 spec）。X は session に一切触れない設計とし、`handleOAuthCallback` の mcp ハンドオフは不変で温存（R3.4 / R3.5 / R5）。

## Architecture Pattern Evaluation

| Option                              | 概要                                                                                              | Strengths                                                                                                                   | Risks / Limitations                                                                           | 判定             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| A: passport カスタム StateStore     | `x.strategy` に stateless な `store/verify` を注入し verifier を暗号化 state に符号化             | passport の token 交換を温存                                                                                                | profile fetch は別途必須・state の二重 consumer・passport 内部 arity 依存・X だけ機構が割れる | 不採用           |
| B: X を手組みフローへ               | passport-oauth2 を X から外し、authorize URL 手組み + token/profile を `XOAuthService` で自前実装 | 5社が同一 `OAuthStateService` + 共通 finalize・passport 依存物理排除（R1.5）・state 単一 consumer・profile fetch は元々必要 | token/profile/エラー処理の自前実装が増える                                                    | **採用**         |
| C: 基盤先行ハイブリッド（プロセス） | 暗号/state 基盤を先に確立 → X 移行 → session 撤去の段階移行                                       | 不変則（R5）を守り段階検証可能                                                                                              | （手段ではなく進め方。A/B と直交）                                                            | 採用（B と併用） |

## Design Decisions

### Decision 1: X フローは Option B（手組み・passport-oauth2 を X から排除）

- **Context**: X を session 非依存の署名 state 機構へ寄せる中心課題。
- **Alternatives Considered**:
  1. Option A — passport カスタム StateStore で verifier を暗号化 state に符号化。
  2. Option B — X を passport から外し、authorize/token/profile を手組み。
- **Selected Approach**: Option B。`generateOAuthAuthorizationUrl('x', state, codeChallenge)` を実装、`XOAuthService` で token 交換 + profile 取得、`x.strategy.ts` / `XAuthGuard` / `x-register-start.*` を撤去。X コールバックは共通 finalize へ合流。
- **Rationale**: ①X profile fetch はどちらでも新規実装が必要で Option A の token 交換再利用メリットが相殺される、②5社が同一 `OAuthStateService` を使い R1.2/R1.3 を最も素直に満たす、③passport の内部 arity 契約への密結合（R-1）を回避、④state の consumer が controller 一箇所に収束。
- **Trade-offs**: token 交換・profile 取得・エラー処理の自前実装が増える（`XOAuthService` 1 クラス）。一方で X の挙動が完全に可視・可制御になる。
- **Follow-up**: 本番クロスオリジン（mosaku.jp ↔ api.mosaku.jp）での X リダイレクト回帰確認。token/profile の失敗系を `auth_failed` へ確実に落とす。

### Decision 2: `InvitationStateService` → `OAuthStateService` へ汎用化（code/verifier を任意化 + AEAD）

- **Context**: ログイン専用 state（code 無し）と PKCE verifier 搬送を 1 つの state 表現で扱う必要。
- **Selected Approach**: サービスを `OAuthStateService` へ昇格。payload を `{ v, p(provider), c?(code), n(nonce), t(iat), ev?(encrypted verifier) }` に拡張。`issueState({ provider, code?, verifier? })` / `verifyState(state, provider)` を提供。wire 形式は既存の `<b64url(payload)>.<b64url(hmac)>` を維持（最小変更）。
- **Rationale**: 既存の HMAC 署名 + TTL + provider 検証 + base64url ロジックを再利用（R5 安全）。verifier のみ AEAD 封緘で R2.5 を満たす。4社の既存 state（code あり / ev 無し）はそのまま通る。
- **Trade-offs**: `verifyState` の `code` 必須前提を任意へ緩和する変更が入る（既存 spec の更新が必要）。
- **Follow-up**: `code` 任意化に伴う `isStatePayload` 型ガードの更新と spec 追従。

### Decision 3: verifier 暗号化は AES-256-GCM、署名鍵と暗号鍵を分離

- **Context**: R4 の AEAD と鍵管理。
- **Selected Approach**: Node `crypto` AES-256-GCM（IV 12 byte ランダム、tag 16 byte）。封緘 `ev = b64url(iv | ciphertext | tag)`。暗号鍵は新規 env `OAUTH_STATE_ENC_KEY`（32 byte / hex 64 字）。HMAC 鍵 `INVITATION_STATE_SECRET` と分離。両鍵とも未設定で fail-fast（R4.4）。`.env.example` に追記（R4.3）。
- **Rationale**: 追加依存ゼロ、改ざん検知が `final()` で自動（R2.4）、鍵用途分離（R4.2）。
- **Trade-offs**: 運用する鍵が 1 本増える。ローテーション時は進行中フロー（≤10分）を無効化（許容）。
- **Follow-up**: 本番 env への鍵投入手順を deployment docs に追記。

### Decision 4: コールバック finalize を 5 社共通化（X 専用分岐の物理削除）

- **Context**: R1.3「コールバックハンドラがプロバイダ分岐を持たない」。
- **Selected Approach**: `handleXCallback` を撤去し、state 検証（任意）→ `code` 有無で login/register を選ぶ共通 finalize に X を合流。4社は passport guard が `req.user` を生成、X は `XOAuthService` が `req.user` を生成し、その後は同一経路。MCP ハンドオフ（`mcpUserId` 注入）は共通 finalize 内に温存。
- **Rationale**: R1.3/R5 を同時に満たす。provider 固有なのは「`req.user` の作り方」のみで、認証成立ロジックは単一。
- **Trade-offs**: X コールバックは token/profile 取得という前段ステップを持つ（passport が4社で隠蔽している処理の明示化）。

## Risks & Mitigations

- **本番クロスオリジンでの X リダイレクト回帰** — 4社で実績のある手組み authorize URL（`generateOAuthAuthorizationUrl`）に X を合流させ、5社×(ログイン/招待)の統合テスト + 本番リダイレクト確認で担保。
- **state 500 字超過（X）** — 短キー JSON + verifier 32 byte のコンパクト符号化を設計制約として固定し、テストで長さ上限を assert。
- **AEAD 鍵未設定での起動** — `OAUTH_STATE_ENC_KEY` / `INVITATION_STATE_SECRET` を fail-fast（R4.4）。長さ不正も起動時に検出。
- **verifier 復号失敗時の握り潰し** — 復号/検証失敗は必ず認証拒否（`auth_failed`）に落とし、成功扱いへフォールスルーさせない（R2.4）。拒否経路を自動テストで固定（R6.4）。
- **MCP ハンドオフの破壊** — `handleOAuthCallback` の `mcpAuthorizeReturn`/`mcpUserId` を変更せず、X が当該 session 書き込みに依存しないことをテストで担保（R3.4）。

## References

- [X OAuth 2.0 Authorization Code Flow with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token) — confidential client の Basic 認証 / code_verifier / users/me 契約
- [X Developer Community: state parameter limit](https://devcommunity.x.com/t/why-is-there-a-state-paramter-limit-for-oauth2-authorization-requests/164824) — state 500 文字制限
- [OAUTH-WG: size limits for the OAuth state parameter](https://www.mail-archive.com/oauth@ietf.org/msg24262.html) — 仕様上限なし・実務制約
- `node_modules/passport-oauth2/lib/strategy.js` (v1.8.0) — StateStore/PKCE 内部契約（L102-303）
- RFC 7636 (PKCE) — `code_verifier` 43–128 字、`code_challenge` S256
- Node.js `crypto` — AES-256-GCM（`createCipheriv`/`getAuthTag`/`setAuthTag`）
