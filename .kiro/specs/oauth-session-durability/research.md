# Research & Design Decisions

---

**Purpose**: oauth-session-durability の design を支える discovery 結果・調査ログ・意思決定の根拠を記録する。`design.md` に載せきれない比較や検証の詳細はここに残す。

---

## Summary

- **Feature**: `oauth-session-durability`
- **Discovery Scope**: Extension（既存 OAuth/セッション基盤の改修。gap-analysis.md で深掘り済み）
- **Key Findings**:
  - X OAuth は複数インスタンス以前に**両フローとも単一インスタンスでも未成立**（gap §3.5 発見 A）。session ストア差し替えだけでは直らず、controller の二重 state 解釈とダミー PKCE start の解消が必須。
  - `req.session` の利用者は **passport-oauth2 の PKCEStateStore のみ**（`req.login`/`regenerate`/`save` 不使用、`@nestjs/passport` は `session:false`）。よって cookie-session への置換は機構上互換（gap §3.5 発見 B）。
  - 実依存は **Express 5.2.1 / passport 0.7.0 / passport-oauth2 1.8.0 / @nestjs/passport 11.0.5**。cookie-session は 2.1.1 が最新。passport×cookie-session の既知の地雷（`session.regenerate is not a function`）は passport 0.6.0 由来で、**本構成は `session:false` のため非該当**だが、Express 5 メジャーでの実機 round-trip を実装ゲートで担保する。

## Research Log

### Topic 1: cookie-session × passport-oauth2 × Express 5 の互換性

- **Context**: 要件の第一候補が「署名付き Cookie ベース」。express-session の MemoryStore を cookie-session に置換しても passport-oauth2 の PKCE/state 機構が壊れないかが最大の不確実性だった。
- **Sources Consulted**:
  - gap-analysis.md §3.5 発見 B（コード実体 grep による検証）
  - [cookie-session - npm](https://www.npmjs.com/package/cookie-session)（最新 2.1.1）
  - [passport issue #965 — req.logIn never sets cookie-session](https://github.com/jaredhanson/passport/issues/965)
  - [cookie-session issue #166 — session.regenerate is not a function](https://github.com/expressjs/cookie-session/issues/166)
  - 実 `node_modules` バージョン: Express 5.2.1 / passport 0.7.0 / passport-oauth2 1.8.0 / express-session 1.19.0
- **Findings**:
  - cookie-session と passport の既知の非互換は **`req.login()` → `session.regenerate()`** 呼び出しに起因（passport 0.6.0+ がセッション固定化対策で呼ぶ）。cookie-session は `regenerate` を実装しない。
  - 本プロジェクトは `@nestjs/passport` の custom callback guard 経由で authenticate しており、`defaultOptions.session === false`。**`req.login` も `req.session.regenerate` も呼ばれない**（gap §3.5 発見 B で全文 grep 済）。
  - `req.session` を触るのは passport-oauth2 の `PKCEStateStore` のみで、`req.session[handle]` のプレーンな get/set/delete だけ。cookie-session が提供する「プレーン `req.session` ＋応答時自動シリアライズ」で必要十分。
- **Implications**:
  - Option A（cookie-session）は機構上採用可能。ただし Express 5 は新メジャーのため、**実装フェーズの RED テストで「passport-oauth2 が cookie-session 上で state+verifier を往復できる」ことを最初のゲート**にする。失敗時のみ Option B にフォールバック。

### Topic 2: X OAuth の 2 フローが共に壊れている根因（発見 A の再確認）

- **Context**: 「session 永続化だけ」で X が直るかを実コードで確認。
- **Sources Consulted**: `auth.controller.ts:138-214`（`runOAuthCallbackWithStateSupport`）、`config.service.ts:296-322`（`generateOAuthAuthorizationUrl`、X case の `code_challenge:'challenge'/plain`）、`x.strategy.ts:34-35`（`pkce:true/state:true`）、`oauth.service.ts:172-184,311-329`、`oauth-start.dto.ts`。
- **Findings**:
  - **Flow A（既存ログイン `/auth/x`）**: passport が CSRF state（ランダム）+ PKCE verifier を `req.session` に保存し callback で照合。単一インスタンスなら passport は成功するが、**直後に controller が `req.query.state`（passport のランダム state）を `verifyState` に渡し HMAC 不一致で必ず throw → `invalid_state` リダイレクト**。
  - **Flow B（招待登録 `POST /auth/oauth/x/start`）**: `generateOAuthAuthorizationUrl('x')` が**ダミー PKCE**（`code_challenge:'challenge'`/`plain`）で URL 生成。passport を経由しないため session が空 → callback で `XAuthGuard` が "Unable to verify authorization request state" で **401（handler 未到達）**。
  - 根因: X **のみ** `state:true` で passport が state を所有するのに、controller は「passport は state を所有しない」前提（他 4 社の HMAC 署名 state 流儀）で書かれている設計矛盾。
- **Implications**:
  - X は callback で **passport のランダム state を `verifyState` に渡さない**こと（＝X 専用 callback 経路）が必須。
  - 招待コードは query state でなく **session 経由**で往復させる（passport が state を所有し上書きするため、state クエリに招待情報を載せられない）。
  - ダミー PKCE の `generateOAuthAuthorizationUrl('x')` 経路は撤去し、X 招待開始を passport 経路に載せ替える。

### Topic 3: sameSite とクロスオリジン構成（Req 3.2）

- **Context**: 本番は `mosaku.jp`（FE） ↔ `api.mosaku.jp`（BE）の別オリジン。session Cookie が X コールバックで送出されるか。
- **Sources Consulted**: `main.ts:42-61,76`（session/CORS/trust proxy）、`config.service.ts:227-242`（refresh cookie の SameSite/secure 上書き前例）、reference_mosaku_urls。
- **Findings**:
  - session Cookie は **`api.mosaku.jp` のファーストパーティ Cookie**（`/auth/x` レスポンスで Set-Cookie）。
  - X コールバック（`twitter.com` → `api.mosaku.jp/auth/x/callback`）は**トップレベル GET ナビゲーション**。`SameSite=Lax` はトップレベル GET ナビゲーションで Cookie を送出する → **Lax で成立**。
  - 招待登録開始（`mosaku.jp` → `api.mosaku.jp/auth/x/register-start`）も `window.location` によるトップレベル GET ナビゲーション → Lax で Set-Cookie 成立。
  - Refresh Token Cookie（XHR `fetch` で送る別系統）が `SameSite=None` を要するのとは異なり、session Cookie は**トップレベルナビゲーションのみ**なので **Lax で十分**。
- **Implications**: 既定 `SameSite=Lax` を維持。`secure=isProduction`、`httpOnly=true`。Cloud Run の `trust proxy=1` 配下で secure Cookie が成立（既存設定踏襲）。env で上書き可能にして実機検証の逃げ道を残す。

### Topic 4: Cookie payload サイズ（Req 3.4）

- **Context**: 署名付き Cookie 方式採用時、state + PKCE verifier + 招待コードが Cookie 4KB 上限に収まるか。
- **Findings**: passport-oauth2 の state handle は `uid(24)`（~24 byte）、PKCE `code_verifier` は 43–128 char、招待コードは 8–50 char、cookie-session の署名は HMAC-SHA1 base64（~27 byte）。合計でも **数百 byte**。4KB 上限に対し大幅な余裕。
- **Implications**: Option A の Cookie サイズ懸念は実質ゼロ。

### Topic 5: `.env.example` の X キー名不一致（Req 4.2 / gap 研究項目 3）

- **Context**: config は `X_CLIENT_ID`/`X_CLIENT_SECRET` を読むが（`config.service.ts:192-201`）、`.env.example` は `X_CONSUMER_KEY`/`X_CONSUMER_SECRET`（L106-107, "currently disabled" コメント）。
- **Findings**: X を有効化するならキー名統一が前提。`X_REDIRECT_URI`（L108）は一致済。`SESSION_SECRET`（L33）は記載済・config で fail-fast 済。
- **Implications**: `.env.example` を `X_CLIENT_ID`/`X_CLIENT_SECRET` に統一（フロントの `VITE_X_CONSUMER_KEY` は本 spec のスコープ外だが整合のため要確認）。

## Architecture Pattern Evaluation

| Option                        | Description                                                            | Strengths                                                            | Risks / Limitations                                                   | Notes                                      |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| **A: cookie-session（採用）** | session 本体を署名付き Cookie に格納。サーバーストア不要               | インフラ追加ゼロ・多インスタンス native・HMAC state 思想と整合       | Express 5 + passport 0.7 の実機互換が未検証 → 実装ゲートで担保        | 要件第一候補。発見 B で機構互換は確認済    |
| B: connect-pg-simple（次点）  | Supabase Postgres に session テーブル。express-session の store に設定 | express-session API 維持＝passport 互換リスク最小・Cookie サイズ無縁 | DB I/O 増・TTL prune 運用（Req 4.4）・pgbouncer(6543) 相性（Req 4.5） | A が実装ゲートで NG の場合のフォールバック |
| C: env 切替ハイブリッド       | env フラグで A/B を切替                                                | 段階移行・ロールバック容易                                           | 2 経路の保守・テスト面積増。現スコープには過剰                        | 不採用                                     |

## Design Decisions

### Decision: セッションストアを cookie-session（Option A）へ置換

- **Context**: Req 1（MemoryStore 排除・全インスタンス共有）。Cloud Run 複数インスタンス/再起動で session 喪失と MemoryStore メモリリークを解消する。
- **Alternatives Considered**:
  1. Option A: cookie-session（署名付き Cookie）
  2. Option B: connect-pg-simple（Supabase Postgres）
- **Selected Approach**: `main.ts` の `express-session(MemoryStore)` を `cookie-session` ミドルウェアに置換。`keys:[SESSION_SECRET]`、`secure:isProduction`、`httpOnly:true`、`sameSite:'lax'`、`maxAge` を OAuth 完了に十分かつ短め（既定 10 分、`STATE_MAX_AGE_MS` と整合）に設定。
- **Rationale**: サーバーストア不要で多インスタンス耐性が原理的に成立。既存の HMAC 署名 state（ステートレス）思想と一致。発見 B で passport 互換を確認済。
- **Trade-offs**: ✅ インフラ追加ゼロ・Cookie サイズ問題なし。❌ Express 5 メジャーでの passport-oauth2 round-trip が未検証 → 実装の最初の RED テストで担保。
- **Follow-up**: 実装フェーズ最初のゲートで「passport-oauth2 が cookie-session 上で state+verifier を往復」を検証。NG なら Option B へ。

### Decision: X 経路を passport 一本化（案 b）＋ controller の二重 state 解釈を撤廃

- **Context**: 発見 A により X は両フロー未成立。Req 2（X の成立＋多インスタンス耐性）。
- **Alternatives Considered**:
  1. 案 b: X は passport 経路（`state:true/pkce:true`）に一本化。controller が passport state を `verifyState` に渡さない。招待コードは session 往復。ダミー PKCE start を撤去。
  2. 案 a: X も HMAC 署名 state へ寄せ PKCE verifier を署名 state に移植し 5 社統一・session 撤去（**スコープ外＝将来別 spec**）。
- **Selected Approach**: 案 b。
  - **X 専用 callback**: `runOAuthCallbackWithStateSupport` の query-state 経路から X を外し、`req.session.xInvitationCode` の有無で register/login を分岐。passport のランダム state を `verifyState` に渡さない。
  - **X 招待開始**: 新 `GET /auth/x/register-start?state=<signedState>` ＋ 新 `XRegisterStartGuard`。signedState を検証して招待コードを `req.session` に格納後、passport へ委譲。`startOAuthRegistration('x')` は twitter 直 URL（ダミー PKCE）でなく register-start の URL を返す。
  - **ダミー PKCE 撤去**: `generateOAuthAuthorizationUrl` の X case を撤去/差し替え。
- **Rationale**: passport の PKCE/state 機構を保持しつつ保存先のみ共有化（store 差し替え）で多インスタンス耐性を確保。controller 矛盾を解消し X を成立させる。案 a はユーザー影響のない内部リファクタで優先度低。
- **Trade-offs**: ✅ 他 4 社のフロー不変・最小改修で X 成立。❌ X だけ callback 分岐が 2 経路（login/register）になる。
- **Follow-up**: 既存テスト `auth.controller.spec.ts:489-517` は `verifyState` をモック成功させ実バグを隠蔽。X の login（state なし）/register（session あり）の実挙動テストを追加。

### Decision: Cookie 属性・有効期間・env 整合

- **Context**: Req 3（セキュリティ整合）・Req 4（構成管理）。
- **Selected Approach**: `secure:isProduction`・`httpOnly:true`・`sameSite:'lax'`（env 上書き可）・`maxAge` 既定 10 分。`SESSION_SECRET` は既存 fail-fast 維持。`.env.example` の X キーを `X_CLIENT_ID`/`X_CLIENT_SECRET` に統一。helmet/CORS(`credentials:true`)/cookie-parser/`trust proxy=1` の既存構成と共存。
- **Rationale**: refresh cookie 系統（クロスオリジン前例）と整合。session は top-level navigation のみのため Lax で十分。
- **Trade-offs**: ✅ 既存セキュリティ構成を崩さない。❌ Cookie 署名鍵（SESSION_SECRET）ローテーション時は進行中フローが無効化（許容）。
- **Follow-up**: Cloud Run 実機で secure+Lax の Set-Cookie/送出を検証。

## Option B フォールバック最小スケッチ（互換ゲート NG 時の即時継続用）

> 互換ゲート（Topic 1）が Express 5 × passport 0.7 × cookie-session で落ちた場合、設計フェーズに逆戻りせず即継続するための最小設計。採用は **ゲート NG 時のみ**。採用時は Req 4.4 / 4.5（design.md では現在 N/A）が有効化される。

- **方式**: `express-session` を維持し、`store` に `connect-pg-simple` を設定（MemoryStore のみ置換）。`req.session` API が express-session のまま＝passport-oauth2 / X 経路整流化（register-start/guard/callback 分岐）のコードは**無改修で流用可能**。差分はミドルウェア構成（`main.ts`）と env・migration に限定。
- **新規 dep**: `connect-pg-simple` + `pg`。
- **session テーブル**: ライブラリ標準 DDL（`session` テーブル: `sid` PK / `sess` jsonb / `expire` timestamptz）。Prisma 管理外の生 SQL migration として追加（Prisma スキーマには載せない＝アプリのドメインモデルと混ぜない）。
- **接続方針（Req 4.5）**: session store は短命な書き込み主体。**`DIRECT_URL`（5432, 直接接続）を使用**し、pgbouncer(6543, transaction pooling) の prepared statement 非互換を回避する。`connect-pg-simple` に専用 `pg.Pool`（小さい `max`）を渡す。
- **TTL / prune（Req 4.4）**: `connect-pg-simple` の `pruneSessionInterval`（既定 15 分の自動 prune）を利用。`maxAge` は cookie 方式と同じ 10 分相当の `ttl` に設定。既存 `@nestjs/schedule`（trash-cleanup）流儀の cron 追加は不要だが、必要なら同パターンで補助 prune を足せる。
- **env 追記**: 専用接続文字列は不要（既存 `DIRECT_URL` 流用）。`SESSION_SECRET` は cookie 方式と共通。
- **Cookie**: session 本体は DB に載るため Cookie には `sid` のみ＝サイズ問題（Req 3.4）は原理的に消滅。`secure`/`httpOnly`/`sameSite:'lax'`/`maxAge` の属性方針は cookie 方式と同一。
- **トレードオフ**: ✅ passport 互換リスク最小・Cookie サイズ無縁。❌ DB I/O・接続管理・prune 運用が増える。本命はあくまで Option A（インフラ追加ゼロ）。

## Risks & Mitigations

- **R1: Express 5 + passport 0.7 で cookie-session が想定外に `regenerate` を要求** — 実装最初の RED テストで passport-oauth2 round-trip を検証。NG 即 Option B（connect-pg-simple）へ。`req.login`/session 認証は本構成で未使用のため発生確率は低。
- **R2: X callback の login/register 誤分岐** — `req.session.xInvitationCode` は register-start guard のみが書き、callback 消費後に必ず削除。login 経路では未設定を保証。テストで両分岐を固定。
- **R3: ダミー PKCE 撤去で既存（壊れている）招待フローの参照が残存** — frontend は `{authorizationUrl}` 契約不変（X は backend register-start URL を返すだけ）。`generateOAuthAuthorizationUrl` の X case 撤去に伴う呼び出し側の回帰をテストで担保。
- **R4: SESSION_SECRET 未設定の本番起動** — 既存 fail-fast（`config.service.ts:114-122`）で throw。Req 1.3/4.3 充足。回帰テストで担保。

## References

- [cookie-session - npm](https://www.npmjs.com/package/cookie-session) — 最新 2.1.1、署名付き Cookie 方式
- [passport issue #965](https://github.com/jaredhanson/passport/issues/965) — passport×cookie-session の `req.logIn` 非互換（本構成は `session:false` で非該当）
- [cookie-session issue #166](https://github.com/expressjs/cookie-session/issues/166) — `session.regenerate is not a function`（同上、非該当）
- gap-analysis.md §3.5（発見 A/B）— X 両フロー未成立と cookie-session 互換の根拠
- 実依存: Express 5.2.1 / passport 0.7.0 / passport-oauth2 1.8.0 / @nestjs/passport 11.0.5 / express-session 1.19.0
  </content>
  </invoke>
