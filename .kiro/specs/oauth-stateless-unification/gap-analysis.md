# 実装ギャップ分析: oauth-stateless-unification

> 本ドキュメントは要件と既存コードベースの差分を整理し、設計フェーズの判断材料を提供するものです。**実装の最終決定ではなく、選択肢と論点の提示**を目的とします。

## 1. 現状調査（Current State）

### 1.1 OAuth フローの現在地

`oauth-session-durability`（案 b）完了後の構成は **「招待登録は署名 state / 通常ログインは passport」「X だけ session 依存」** という二層構造になっている。

| プロバイダ                     | 通常ログイン開始                                                  | 招待登録開始                                                                                                                                    | コールバック検証                                                                          | session 依存                                                              |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Google / GitHub / LINE / Apple | `@Get('/auth/{p}')` → passport が認可 URL へ 302                  | `POST /auth/oauth/:provider/start` → `generateOAuthAuthorizationUrl` で**手組み URL**（署名 state 付き）を返す                                  | `runOAuthCallbackWithStateSupport`（state あり=招待登録 / なし=ログイン）                 | **なし**（passport は `state:false` で token 交換のみ）                   |
| X                              | `@Get('/auth/x')` → passport-oauth2 `state:true/pkce:true` で 302 | `POST .../start` → `generateXRegisterStartUrl` → `@Get('/auth/x/register-start')`（`XRegisterStartGuard` が session に `xInvitationCode` 格納） | `handleXCallback`（**X 専用経路**。passport が session の state/verifier を検証済の前提） | **あり**（CSRF state・PKCE verifier・招待コードを cookie-session に保存） |

### 1.2 主要アセット

- `backend/src/auth/invitation-state.service.ts` — base64url(JSON) + HMAC-SHA256 署名 state の発行/検証。ペイロードは `{code, provider, nonce, iat}` 固定、`STATE_MAX_AGE_MS = 10分`。**暗号化機構なし・`code` 必須（ログイン専用 state を表現できない）**。
- `backend/src/auth/x.strategy.ts` — `passport-oauth2` を `pkce:true / state:true` で構成。verifier/state を `req.session` に委譲。
- `backend/src/auth/auth.controller.ts`
  - `startOAuthRegistration`（L102）: 5 社統一の開始口。ただし内部で X だけ分岐（L116）。**かつ `verifyInvitation(body.invitationCode)` 必須＝通常ログインには未対応**。
  - `runOAuthCallbackWithStateSupport`（L143）: 4 社共通コールバック。
  - `handleXCallback`（L698）: X 専用。`req.session.xInvitationCode` 読み出し（L706-707）。
- `backend/src/auth/x-register-start.guard.ts` — `req.session.xInvitationCode = code`（L32-33）に書き込み。
- `backend/src/auth/x-register-start.{exception,filter}.ts`, `x-cookie-session-gate.spec.ts`, `auth.x-flow.integration.spec.ts` — X 専用テスト/フィルタ群。
- `backend/src/main.ts`（L41-57）— `cookieSession` ミドルウェア。`helmet → cookie-parser → cookie-session → CORS` の順。
- `backend/src/config/config.service.ts` — `sessionSecret`（L138 fail-fast）/ `sessionCookieOptions`（L153）/ `generateOAuthAuthorizationUrl`（L371, X は例外送出 L405）/ `generateXRegisterStartUrl`（L361）。
- `.env.example` — `SESSION_SECRET`(L33), `SESSION_COOKIE_*`(L37-39), `INVITATION_STATE_SECRET`(L47)。

### 1.3 ⚠️ 重大な発見: MCP も cookie-session に依存 → 【スコープ確定済み】

`backend/src/mcp/auth/oauth.controller.ts` が **OAuth ログインとは別に** `req.session`（`mcpAuthorizeParams` / `mcpUserId` / `mcpAuthorizeReturn`）を使用している（L112, 151, 165 ほか）。`main.ts` の `cookieSession` ミドルウェアはこの MCP 認可フローの共有基盤でもある。

**結合点**: 通常ログインの共通コールバック `handleOAuthCallback`（`auth.controller.ts:268-272`）が、`session.mcpAuthorizeReturn` がある場合に `session.mcpUserId = result.user.id` を書き込んで MCP authorize へ戻す。**OAuth ログインと MCP authorize は session を跨ぎチャネルとして共有している**。

**性質の違い（判断の根拠）**:

|                | X OAuth（旧）                               | MCP 認可フロー                                                   |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| 用途           | CSRF state / PKCE verifier 保持             | authorize→consent 間の params / ログイン後の userId ハンドオフ   |
| オリジン       | クロスオリジン（mosaku.jp ↔ api.mosaku.jp） | **同一オリジン（api.mosaku.jp 内のサーバーレンダ HTML フロー）** |
| session 適合性 | stateless 化すべき                          | **同一オリジンの短命サーバー状態＝session の正当用途**           |

→ **【決定: スコープ分割】** Req3 の元動機だった MemoryStore リークは `oauth-session-durability` の cookie-session 移行で解消済み。MCP は同一オリジンで session を正当利用しているため、本 spec は **OAuth ログイン側の session 依存をゼロにすること**へ Req3 を再定義し、cookie-session ミドルウェアは **MCP 認可フロー専用に縮退**させて残す。MCP authorize の stateless 化と cookie-session の完全撤去は**別 spec（将来）**へ委譲。`handleOAuthCallback` の `mcpUserId` 注入は MCP 専用ハンドオフとして本 spec では存置し、X を含む全プロバイダの認証成立がこの書き込みの成否に依存しない状態を維持する。

## 2. 要件 → アセット マッピング（ギャップ）

| 要件                                                                         | 必要な技術要素                                                                     | 既存アセット                                                                | ギャップ判定                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **R1** 5社統一ステートレスフロー                                             | X を署名 state 経路へ。controller の X 分岐除去                                    | `startOAuthRegistration`/`runOAuthCallbackWithStateSupport` が 4 社で確立済 | **Constraint**: X 通常ログイン（招待なし）の統一経路が未存在。`start` は invitation 必須       |
| **R2** PKCE verifier の署名 state 持ち回り                                   | verifier 生成 / `code_challenge` S256 / 暗号化して state 搭載 / コールバックで復号 | S256・暗号化・state 搭載いずれも**未実装**。現状 passport が session 保存   | **Missing**: 暗号化機構・verifier 搬送形式                                                     |
| **R3** OAuth ログインの session 非依存化（cookie-session は MCP 専用へ縮退） | X の session 利用撤去・`handleXCallback`/`x-register-start.*` 除去                 | `main.ts` / `config.service` / `x.strategy` / X 専用群                      | **Constraint**: cookie-session 自体は MCP のため残置（§1.3 で確定）。X の session 依存のみ撤去 |
| **R4** 暗号処理と鍵管理                                                      | 認証付き暗号（AEAD）・env 鍵・未設定検知・state TTL                                | HMAC 署名・TTL(10分)・fail-fast は既存。**AEAD 暗号鍵は未導入**             | **Missing**: 暗号鍵 env（例: `OAUTH_STATE_ENC_KEY`）と AEAD 実装                               |
| **R5** 認証挙動の不変                                                        | JWT 発行・リダイレクト・招待解決の同一性維持                                       | `oauth.service` の `*Login`/`*RegisterWithStateInvitation` は再利用可       | **Low**: 経路差し替えのみ。出口は不変                                                          |
| **R6** セキュリティ整合・回帰防止                                            | helmet/CORS/cookie 整合・5社×(ログイン+招待)テスト・拒否経路テスト                 | 既存テスト資産あり。X 専用 spec は再構成必要                                | **Constraint**: テスト網羅の作り直し                                                           |

## 3. 実装アプローチの選択肢

中心的な技術課題は **「X の PKCE verifier + state を session の代わりに署名 state に載せて往復させる」** 一点に集約される。ここで 2 系統の実現方式がある。

### Option A: passport-oauth2 のカスタム StateStore で吸収（拡張）

passport-oauth2 は `store` オプションでカスタム StateStore（`store(req, meta, cb)` / `verify(req, providedState, cb)`）を差し込める。PKCE 有効時、verifier はこのストア経由で保持される。これを **「session ではなく署名+暗号化した state 文字列に符号化する」** 実装に置き換える。

- **拡張対象**: `x.strategy.ts`（`store` 注入）＋ 新規 `StatelessOAuthStateStore`。`InvitationStateService` を暗号化対応に拡張。
- ✅ passport の token 交換ロジックをそのまま再利用（手組み token 交換が不要）
- ✅ `handleXCallback` を 4 社共通の `runOAuthCallbackWithStateSupport` 系へ寄せやすい
- ❌ passport-oauth2 の StateStore/PKCE 内部契約（verifier の符号化タイミング）への依存。バージョン差異の **Research Needed**
- ❌ store の `verify` 内で invitation コードと verifier を同居させる state 設計が必要

### Option B: X を passport から外し手組みフローへ（新規）

他 4 社の開始が既に `generateOAuthAuthorizationUrl` で手組みなのに合わせ、**X も手組み**にする。開始時に verifier 生成→`code_challenge` を URL に付与、コールバックで state から verifier 復号→`https://api.twitter.com/2/oauth2/token` へ手動 token 交換→profile 取得。

- **新規**: `generateOAuthAuthorizationUrl('x')` 実装（現状は例外送出 L405）、X token 交換サービス。`x.strategy.ts` / `XAuthGuard` / `x-register-start.*` 群を撤去。
- ✅ session 依存・passport-oauth2 を X から完全排除。5 社が真に 1 経路（controller の X 分岐が物理的に消滅 = R1.3 を最も素直に満たす）
- ✅ 暗号化 state の符号化を自前で完全制御
- ❌ token 交換・エラー処理・X profile 取得（`users.read`）を自前実装する責務増
- ❌ 通常ログイン経路（招待なし state）の新設計が必要

### Option C: ハイブリッド / 段階移行（推奨ベース）

1. **基盤先行**: `InvitationStateService` を汎用 `OAuthStateService` へ昇格し、`code`(任意) + 暗号化 `verifier`(任意) + `provider` + `iat`/`nonce` を載せる AEAD（例: `crypto` AES-256-GCM）を追加。鍵 env と未設定検知・TTL を整備（R2/R4 を先に固める）。
2. **X 移行**: Option A か B で X を新方式へ。通常ログイン（招待なし）の統一開始口も用意。
3. **X の session 撤去**: X 移行完了後、`x.strategy` の `state:true`/`pkce:true`・`x-register-start.*` の session 書き込みを除去。cookie-session ミドルウェアは MCP 専用として残置し、その旨を `main.ts` にコメント明記（R3 確定スコープ）。`handleOAuthCallback` の `mcpUserId` 注入は存置。

- ✅ 不変則（R5）を守りつつ段階検証可能。基盤（暗号/state）と移行（X）と session 撤去を分離
- ✅ §1.3 の決定で R3 のゴールが確定済み（OAuth ログインの session 非依存化）。MCP 全廃は別 spec へ切り出し済み

## 4. Research Needed（設計フェーズへ持ち越し）

- **R-1**: passport-oauth2 のカスタム `store` が PKCE `code_verifier` をどのタイミング・形式で保持/復元するか（Option A 採否の決め手）。
- ~~**R-2**: MCP 認可フローの session 依存をどう扱うか~~ → **【解決済み】** §1.3 でスコープ分割を決定。MCP は cookie-session を正当利用しているため本 spec 対象外、cookie-session は MCP 専用に縮退して残置、MCP の stateless 化は別 spec。本 spec の R3 ゴールは「OAuth ログインの session 非依存化」に確定。
- **R-3**: AEAD 方式の確定（AES-256-GCM vs `crypto.seal`/libsodium 相当）。鍵の env 名・長さ・ローテーション方針。署名鍵（HMAC）と暗号鍵を分離するか統合するか。
- **R-4**: X 通常ログイン（招待コードなし）の開始経路設計。`startOAuthRegistration` の invitation 必須前提をどう一般化するか。
- **R-5**: state 長の上限。verifier(43-128字)を暗号化して載せると URL/state が伸びる。X/各 IdP の state パラメータ長制限の確認。

## 5. 複雑度・リスク

- **Effort: L（1〜2週間）** — 暗号基盤の新規導入 + X フロー全面差し替え + session 撤去 + 5社×2(ログイン/招待)+拒否経路のテスト再構成。単一ファイルでは収まらない横断変更。
- **Risk: Medium** —
  - 低減要因: 出口（`oauth.service`/JWT/リダイレクト）は不変で再利用でき、4 社の署名 state 経路という前例がある。§1.3 のスコープ確定（MCP を別 spec へ分離）で R3 の達成可否の不確実性が消えた。
  - 残存要因: passport-oauth2 内部契約（R-1）が Option A 採否の鍵。本番クロスオリジン（mosaku.jp ↔ api.mosaku.jp）での X リダイレクト回帰リスク。AEAD 鍵管理（R-3）の新規導入。

## 6. 設計フェーズへの推奨

- **推奨アプローチ**: Option C（基盤先行のハイブリッド）。まず `OAuthStateService`＋AEAD を確立 → X 移行は **Option A を第一候補**（passport の token 交換を温存できコスト最小）、R-1 の調査で StateStore 契約が不透明なら Option B へフォールバック。
- **スコープ確定済み**: MCP の session 依存は別 spec へ分離し、本 spec の R3 は「OAuth ログインの session 非依存化」に確定（§1.3）。cookie-session は MCP 専用へ縮退して残置。
- **設計で最初に決すべき 2 点**: ①X の StateStore 方式（Option A: passport カスタム store / Option B: 手組み）を R-1 調査で確定、②暗号鍵の env 設計と HMAC 鍵との分離（R-3）。
- **不変則の死守**: R5（認証挙動不変）。`oauth.service` の login/register 出口は変更しない。`handleOAuthCallback` の MCP ハンドオフ（`mcpUserId` 注入）は壊さない。
