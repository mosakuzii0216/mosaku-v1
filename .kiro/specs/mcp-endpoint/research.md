# Research & Design Decisions — mcp-endpoint (v1)

---

**Purpose**: design.md の判断根拠となる discovery 結果・調査ログ・意思決定のトレードオフを記録する。design.md 本文は自己完結させ、本書は背景・出典・棄却案の保管庫とする。

---

## Summary

- **Feature**: `mcp-endpoint`
- **Discovery Scope**: Complex Integration（新規プロトコル層 + 既存 auth/memo 基盤への結線 + mosaku を OAuth 認可サーバー化）
- **Key Findings**:
  1. 最新 MCP 認可仕様（2025-11-25）では **MCP サーバー = OAuth 2.1 Resource Server**。トークン検証（署名 + audience）が MUST、`resource`（RFC 8707）による audience バインディングが MUST。`.well-known/oauth-protected-resource`（RFC 9728）の公開が MUST。
  2. **認可サーバー（AS）はリソースサーバーと同居してよい**（"It may be hosted with the resource server or a separate entity"）。mosaku は既に社会ログイン + JWT 発行基盤を持つため、**自前で最小 AS を同居実装**するのが最もコスト・整合性に優れる（第三者 AS 委譲は不要 → R8 の「定額・従量なし」を維持）。
  3. **DCR（RFC 7591）は MAY に降格**（旧版 SHOULD）。最新版は Client ID Metadata Documents（CIMD）を SHOULD として推す。ただし Claude Code / claude.ai Custom Connector の実接続では DCR が事実上の自動接続経路であるため、**v1 は DCR を実装**し、CIMD は前方互換として将来拡張に回す。
  4. TypeScript SDK `@modelcontextprotocol/sdk` が認可ヘルパー（`mcpAuthRouter` / `requireBearerAuth` / `OAuthServerProvider` / `mcpAuthMetadataRouter`）と `StreamableHTTPServerTransport` / `McpServer.registerTool` を提供。Express ネイティブのため NestJS（Express アダプタ）に結線可能。
  5. Cloud Run はステートレス/オートスケール前提のため、**ステートレス Streamable HTTP**（`sessionIdGenerator: undefined`、リクエスト毎に transport 生成）を採用し `Mcp-Session-Id` のスティッキー問題を回避する。

---

## Research Log

### MCP 認可仕様（2025-11-25 revision）

- **Context**: gap-analysis が「最大の谷 = R2（OAuth 2.1）」と指摘。mosaku を AS 化する範囲の確定が設計の肝。
- **Sources Consulted**:
  - [Authorization — Model Context Protocol 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
  - RFC 9728（Protected Resource Metadata）/ RFC 8414（AS Metadata）/ RFC 7591（DCR）/ RFC 8707（Resource Indicators）/ OAuth 2.1 draft-13
- **Findings**（規範要件の抜粋）:
  - MCP サーバーは OAuth 2.1 **resource server**。`MUST` validate access tokens（OAuth 2.1 §5.2）、`MUST` validate audience（RFC 8707 §2）、無効/期限切れは `MUST` 401。
  - `MUST` implement RFC 9728 Protected Resource Metadata。返却 doc に `authorization_servers`（最低 1 件）を含めること。
  - 認可サーバー位置の通知は 2 手段のいずれか（両方推奨）: ①401 の `WWW-Authenticate` ヘッダに `resource_metadata` を含める ②`.well-known/oauth-protected-resource` を公開。クライアントは両対応が MUST。
  - AS は `MUST` OAuth 2.1 実装 + `MUST` RFC 8414 もしくは OIDC Discovery のいずれかでメタデータ公開。`code_challenge_methods_supported` が無いとクライアントは接続中止（PKCE 必須の発見手段）。
  - PKCE: クライアントは `MUST` S256。`resource` パラメータは authorize/token 両方で `MUST` 送信。
  - 登録方式の優先順位: 事前登録 → CIMD（`client_id_metadata_document_supported`）→ DCR（`registration_endpoint`）→ 手動入力。DCR は「後方互換のため」と明記され `MAY`。
  - エラー: 401（未認可/トークン無効）/ 403（スコープ不足、`WWW-Authenticate: error="insufficient_scope"`）/ 400（不正リクエスト）。
  - audience 検証失敗・token passthrough は明確に禁止。MCP サーバーは自分宛て以外のトークンを `MUST NOT` 受理。
- **Implications**:
  - mosaku が **RS + AS を同居**実装。RS 側は bearer 検証（署名 + `aud` = canonical MCP URI + scope）。AS 側は discovery / register(DCR) / authorize / token を提供。
  - MCP アクセストークンは**既存ログイン用トークンとは別物**として、`aud`（resource）と `scope`（`memo:read` / `memo:write`）を持つ mosaku 署名 JWT を新規に発行する（既存 JWT 署名基盤 `JwtTokenService` を再利用しつつ claims を拡張）。

### `@modelcontextprotocol/sdk` の結線

- **Context**: MCP プロトコル層は完全新規（SDK 未導入）。NestJS + Express アダプタへのマウント形を確定する。
- **Sources Consulted**:
  - [typescript-sdk/docs/server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
  - [requireBearerAuth — MCP TS SDK docs](https://ts.sdk.modelcontextprotocol.io/v2/functions/_modelcontextprotocol_express.auth_bearerAuth.requireBearerAuth.html)
  - 実装ガイド各種（Portal One / ITNEXT / den.dev）
- **Findings**:
  - `McpServer`（`@modelcontextprotocol/sdk/server/mcp.js`）+ `server.registerTool(name, { title, description, inputSchema(zod), outputSchema }, handler)`。
  - `StreamableHTTPServerTransport`（`@modelcontextprotocol/sdk/server/streamableHttp.js`）。`sessionIdGenerator: undefined` でステートレス、`() => randomUUID()` でステートフル。`transport.handleRequest(req, res, body)` で Express req/res を処理。
  - 認可ヘルパー: `requireBearerAuth`（`.../server/auth/middleware/bearerAuth.js`、`OAuthTokenVerifier` を渡すと検証 → `req.auth` に `AuthInfo`）、`mcpAuthRouter` / `mcpAuthMetadataRouter` / `getOAuthProtectedResourceMetadataUrl`（`.../server/auth/router.js`）、`OAuthServerProvider`（実装インターフェース）。
  - DNS rebinding 対策に Host ヘッダ検証あり（`enableDnsRebindingProtection` / `allowedHosts`）。
- **Implications**:
  - MCP 入口は **NestJS `@Public()` コントローラ**にし、`@Req()/@Res()` をサービスへ渡して `StreamableHTTPServerTransport` を駆動。Sentry グローバルフィルタ / Throttler / ロギングを Nest の DI・APP_FILTER 経路に乗せたまま使える。
  - OAuth エンドポイント（discovery/register/authorize/token）は **SDK の `OAuthServerProvider` を自前実装**し、薄い NestJS `@Public()` コントローラから provider メソッドを呼ぶ。SDK の `mcpAuthRouter`（Express Router）を `app.use()` で直接マウントする案は Nest のフィルタ/ガード/Throttler を迂回するため棄却。

### search の深さ・既定保存先

- **Context**: R4（検索）と R3.4（既定保存先）/ `title` 必須制約。
- **Findings**:
  - 既存 `MemoService.search(query, userId)` は userId 限定 + `trashedAt: null` + title/content の大小無視 `contains`。`searchPaginated` で `take` 上限実現可。
  - `Memo.title` は `@db.VarChar(100)` かつ NOT NULL。MCP 入力は `content` のみのため **title 自動生成が必須**。
- **Implications**:
  - v1 検索は Postgres `contains`（キーワード）で確定。semantic（埋め込み）は v2。返却上限 = 20（既定）。
  - 既定保存先: `MemoService.create` は `notebookId` 未指定時に `null` で作成し、既存 UI ではこれが「Inbox/未分類」ビューに着地する（DTO コメント「未指定はInbox」と一致）。**専用ノートの新設は不要**で、`notebook` 無指定時は `notebookId = null` のまま委譲する。title は content 先頭行（trim 後 ~80 文字、改行除去）→ 空なら `MCP メモ <ISO日付>`。

---

## Architecture Pattern Evaluation

| Option                                           | Description                                                                                                                  | Strengths                                                                           | Risks / Limitations                                                                | Notes                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------- |
| A: 既存 Auth/Memo に相乗り                       | `AuthController`/`MemoController` 付近に MCP・OAuth を追加                                                                   | 新規ファイル最小                                                                    | 667 行の AuthController が更に肥大、責務混線、MCP 依存が auth に漏れる             | gap-analysis で適性低 |
| **B: 独立 `McpModule` + 認可サーバー層**（採用） | `backend/src/mcp/`（protocol + tools）+ `backend/src/mcp/oauth/`（AS）。tool は `MemoService`/`NotebookService` を DI 直呼び | 責務分離・単体テスト容易・既存 REST 認証に無影響・「1ドメイン=1モジュール」規約合致 | ファイル数増・AS 実装の手間                                                        | structure.md 準拠     |
| C: 第三者 AS へ委譲（Auth0 等）                  | mosaku は RS のみ、発行は外部 AS                                                                                             | AS 実装ゼロ                                                                         | 月額ベンダーコスト発生（R8「定額・従量なし」に反する）・社会ログイン基盤を二重持ち | 棄却                  |

**選定**: Option B（モジュール構成）。AS は**自前同居**（Option C 棄却）。OAuth の作り込みは feature flag で段階公開可能にする（Claude Code 手動接続 → claude.ai 自動接続）。

---

## Design Decisions

### Decision: mosaku を RS + 自前 AS として同居実装する

- **Context**: R2。mosaku は現状 OAuth の _クライアント_（social ログイン）でしかなく AS ではない。
- **Alternatives Considered**:
  1. 第三者 AS（Auth0/Keycloak）に委譲 — RS のみ実装で済む
  2. 自前で最小 AS を同居実装 — SDK `OAuthServerProvider` を mosaku 基盤に橋渡し
- **Selected Approach**: (2)。`McpOAuthProvider implements OAuthServerProvider` を実装し、authorize で既存 social ログイン/セッションを再利用 → 同意 → 認可コード発行、token で PKCE 検証 → MCP 専用 JWT（`aud`+`scope`）発行。discovery / DCR は SDK ヘルパーで公開。
- **Rationale**: 既存の JWT 署名・social ログイン・ユーザー解決をそのまま使える。ベンダーコストゼロで R8 を満たす。ユーザーは追加アカウント不要。
- **Trade-offs**: AS の OAuth 仕様準拠（PKCE/メタデータ/コード一回限り/リフレッシュ回転）を自前担保する負担。SDK 準拠実装で軽減。
- **Follow-up**: PKCE S256 / 認可コード TTL（≤60s）/ リフレッシュトークン回転を実装時に検証。

### Decision: MCP アクセストークン = audience 限定の専用 JWT

- **Context**: R2.6（scope を memo read/write に限定）+ 仕様の audience バインディング MUST。
- **Selected Approach**: `JwtTokenService` の署名鍵を再利用しつつ、`{ sub, aud: <canonical MCP URI>, scope: "memo:read memo:write", token_use: "mcp" }` を持つ専用アクセストークンを発行。bearer 検証時に署名 + `aud` 一致 + `token_use=mcp` + 必要 scope を確認。
- **Rationale**: 既存ログイン用トークン（aud 無し）を MCP 入口で誤受理しない（token passthrough 禁止に準拠）。検証経路は `JwtStrategy` のロジックを共有可能。
- **Trade-offs**: トークン種別の分岐が増える。`token_use` クレームで明示し誤用を防ぐ。
- **Follow-up**: 既存 `JwtStrategy`（REST 用）が MCP トークンを受理しない／その逆も成立しないことをテストで担保。

### Decision: ステートレス Streamable HTTP

- **Context**: R1 + Cloud Run のステートレス/オートスケール前提（gap-analysis Research #6）。
- **Selected Approach**: `sessionIdGenerator: undefined` でリクエスト毎に `McpServer` + `StreamableHTTPServerTransport` を生成・処理・破棄。`Mcp-Session-Id` のサーバー側保持はしない。
- **Rationale**: インスタンス間のセッション共有（Redis 等）が不要。Cloud Run の任意インスタンスで処理可能。tool はリクエスト毎の認証ユーザーをクロージャ束縛。
- **Trade-offs**: サーバー発のストリーミング通知（長時間 SSE）には不向き。v1 の 2 tool は短命 request/response のため問題なし。
- **Follow-up**: 将来 streaming 通知が必要になればステートフル + セッションストアを再検討。

### Decision: DCR を v1 で実装（CIMD は将来）

- **Context**: 最新仕様で DCR は MAY だが Claude 系クライアントの自動接続実態。
- **Selected Approach**: `registration_endpoint`（RFC 7591）を公開し、動的登録クライアントを `McpOAuthClient` テーブルに永続化。AS メタデータに `registration_endpoint` を広告。feature flag で開閉可能に。
- **Rationale**: 本命 Claude Code の `claude mcp add` と claude.ai Custom Connector の双方を「手動 client_id 設定なし」で繋げる最短経路。
- **Trade-offs**: オープン登録は濫用面。redirect_uri 完全一致検証 + 登録レート制限 + flag で緩和。
- **Follow-up**: CIMD（`client_id_metadata_document_supported`）対応は v2。SSRF 対策込みで検討。

### Decision: 既定保存先 = notebookId null（既存 Inbox/未分類）+ title 自動生成

- **Context**: R3.4 + `Memo.title` NOT NULL/VarChar(100)。`MemoService.create` は notebookId 未指定で `null` 作成 → 既存 UI の Inbox/未分類ビューに着地する挙動が既にある。
- **Selected Approach**: `notebook` 無指定時は `notebookId = null` のまま `MemoService.create` に委譲（専用ノート新設なし）。`notebook` 指定時は id もしくは名前でユーザー所有ノートを解決し、未所有/不存在なら R3.5 エラー。title は content 先頭行を trim/改行除去して ≤80 文字、空なら `MCP メモ <ISO日付>`。
- **Rationale**: 既存挙動・データ表現と完全一致（R3.7）。新規ノート生成のスコープ・リスクを排除。Web UI でも通常メモとして閲覧・編集可能。
- **Trade-offs**: MCP 由来メモが専用の箱に分離されない。将来、専用 Inbox や source タグが必要なら別途検討。
- **Follow-up**: `notebook` 入力を id 解決のみとするか名前解決も許すかを実装時に確定（MVP は id 推奨、名前は曖昧性あり）。

### Decision: Sentry `feature_area` enum に `mcp` を追加

- **Context**: R7.2。現行 enum に `mcp` が無い（tech.md の固定契約）。
- **Selected Approach**: `feature_area` enum に `mcp` を追加し、tech.md の契約記述を更新。
- **Rationale**: MCP 障害を triage 粒度で識別するため。
- **Trade-offs**: 固定契約の変更（steering 同期が必要）。
- **Follow-up**: design 承認後 / 実装時に tech.md §Sentry 構造化タグ契約を更新。

---

## Risks & Mitigations

- **OAuth AS 自前実装の仕様準拠漏れ** → SDK の `OAuthServerProvider`/`mcpAuthRouter` 準拠実装に寄せ、PKCE/メタデータ/コード一回限り/リフレッシュ回転を spec ベースのユニット/E2E で検証。
- **クライアント互換（Claude Code / claude.ai）が繋がらない** → 段階公開（flag）。まず Claude Code を `claude mcp add --transport http` で疎通確認、次に claude.ai Custom Connector（DCR + 完全メタデータ）。WWW-Authenticate と well-known の両 discovery を実装。
- **トークン誤受理（confused deputy / passthrough）** → `aud` + `token_use=mcp` 検証で REST トークンと相互排他。upstream へのトークン転送は行わない（mosaku はメモ DB のみ）。
- **外部 AI からの濫用** → tool 実行に user 単位 throttle、register/authorize/token にも個別レート制限。`@nestjs/throttler` 再利用。
- **Cloud Run リクエストタイムアウト** → ステートレス短命 request/response 設計で長時間接続を回避。
- **既存 REST 認証への副作用** → MCP/well-known は `@Public()` で JWT Guard を opt-out。MCP 内で独自 bearer 検証。既存 throttle 値は変更しない。

## References

- [Authorization — MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — RS/AS 役割・MUST/SHOULD・discovery・PKCE・RFC 8707
- [typescript-sdk server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — McpServer/registerTool/StreamableHTTPServerTransport
- [requireBearerAuth — MCP TS SDK](https://ts.sdk.modelcontextprotocol.io/v2/functions/_modelcontextprotocol_express.auth_bearerAuth.requireBearerAuth.html) — bearer 検証 / OAuthTokenVerifier
- [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) — Protected Resource Metadata
- [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) — Authorization Server Metadata
- [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) — Dynamic Client Registration
- [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html) — Resource Indicators
- [OAuth 2.1 draft-13](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13) — PKCE / token validation / refresh rotation
