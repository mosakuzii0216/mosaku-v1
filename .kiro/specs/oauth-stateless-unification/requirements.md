# Requirements Document

## Introduction

本 spec は OAuth フローを**完全ステートレス化**し、5 プロバイダ（Google / GitHub / LINE / Apple / X）を**単一フローへ統一**する内部リファクタである。

先行する `oauth-session-durability`（案 b）で、X ログインの不整合（controller の二重 state 解釈・ダミー PKCE）と多インスタンス耐性は解消済み（`implementation-validated`）。ただし X は依然として passport-oauth2 の `state:true / pkce:true` による `express-session`（cookie-session）依存で、controller には X 専用の例外分岐が残っている。

本 spec はその上で、X も他 4 社と同じ **HMAC 署名 state 方式**へ寄せ、PKCE の `code_verifier` を**暗号化して署名 state に載せて持ち回る**ことで、`express-session` / `cookie-session` 自体を全廃する。これにより、5 社が 1 フローに統一され、controller の X 例外分岐が消え、session ストア（MemoryStore / cookie-session / pg ストア）を全廃でき、将来のプロバイダ追加が 1 パターンになる。

本 spec は**ユーザー影響のある不具合修正ではなく内部リファクタ**である。したがって、エンドユーザーから見た認証挙動（ログイン成立・JWT 発行・リダイレクト・招待登録）は一切変更しないことを最上位の制約とする。`oauth-session-durability` の安定稼働を前提とする。

新規に必要となる暗号処理（PKCE `code_challenge` の S256 生成、`code_verifier` の暗号化と復号、鍵管理）は本 spec のスコープに含む。現行 `InvitationStateService` は HMAC 署名のみで、verifier の暗号化機構は未実装である。

### 用語

- **署名 state**: `InvitationStateService` が発行する base64url + HMAC-SHA256 署名付きの state 値。session 非依存。
- **PKCE verifier**: OAuth 2.0 PKCE の `code_verifier`。現状 X では passport-oauth2 が `req.session` に保存している。
- **統一 OAuth フロー**: 5 プロバイダすべてが session を介さず署名 state のみで開始・コールバックを処理する単一の経路。

## Requirements

### Requirement 1: 5 プロバイダ統一のステートレス OAuth フロー

**Objective:** 保守者として、5 プロバイダすべてを session に依存しない単一の OAuth フローで処理したい。これにより、プロバイダごとの分岐が消え、将来のプロバイダ追加が 1 パターンで済むようにする。

#### Acceptance Criteria

1. The OAuth Flow shall すべての対応プロバイダ（Google・GitHub・LINE・Apple・X）の認証開始およびコールバック処理を、session に依存しない署名 state 方式の単一経路で処理する。
2. When X の認証開始を処理する, the OAuth Flow shall 他 4 プロバイダと同一の署名 state 発行・検証機構を用いる。
3. The OAuth Callback Handler shall プロバイダ種別による分岐（X 専用の例外経路）を持たず、すべてのプロバイダで同一の state 検証・コールバック処理経路をたどる。
4. Where 新規 OAuth プロバイダを追加する, the OAuth Flow shall 既存プロバイダと同一の署名 state 方式に従って追加できる構造を提供する。
5. The OAuth Flow shall passport-oauth2 の `state:true` / `pkce:true`（session 依存の state / verifier 保存）に依存しない。

### Requirement 2: PKCE の完全ステートレス化（verifier の署名 state 持ち回り）

**Objective:** 保守者として、PKCE の `code_verifier` を session に保存せず署名 state に載せて往復させたい。これにより、X においても session を介さずに PKCE を成立させ、session ストアを不要にする。

#### Acceptance Criteria

1. When PKCE を必要とするプロバイダの認証開始を処理する, the OAuth Flow shall `code_verifier` を生成し、その `code_challenge`（S256）を認可リクエストに付与する。
2. When 認証開始時に PKCE `code_verifier` を発行する, the OAuth Flow shall `code_verifier` を暗号化したうえで署名 state に載せ、session に保存しない。
3. When コールバックを処理する, the OAuth Flow shall 署名 state から `code_verifier` を復号して取り出し、トークン交換に用いる。
4. If 署名 state に含まれる `code_verifier` の復号または検証に失敗する, then the OAuth Flow shall 認証を拒否し、エラーとして扱う。
5. The OAuth Flow shall `code_verifier` を平文のままクライアントへ露出せず、署名 state 内では暗号化された形でのみ保持する。

### Requirement 3: OAuth ログインフローの session 非依存化

**Objective:** 運用者として、OAuth ログイン／招待登録フローから session 依存を完全に断ちたい。これにより、X の cookie-session 依存（CSRF state / PKCE verifier / 招待コードの session 保存）という保守・運用コストを排除する。

> **スコープ注記**: `oauth-session-durability` で cookie-session へ移行済みのため MemoryStore のメモリリーク源は解消済みである。残る cookie-session は本 spec 対象の OAuth ログインフローのほかに、**MCP 認可フロー（`mcp/auth/oauth.controller.ts`）が同一オリジン内のサーバー側短命状態（`mcpAuthorizeParams` / `mcpUserId` / `mcpAuthorizeReturn`）として正当に利用している**。MCP 認可フローの stateless 化と cookie-session ミドルウェアの完全撤去は **別 spec（将来）** に委ねる。本 spec では cookie-session を MCP 認可フロー専用へ縮退させ、OAuth ログイン側の session 依存をゼロにすることをゴールとする。

#### Acceptance Criteria

1. The OAuth Flow shall ログイン・招待登録の成立のために `req.session`（CSRF state / PKCE verifier / 招待コードの保存）を一切必要としない。
2. The OAuth Callback Handler shall すべてのプロバイダのコールバック処理において、認証成立に必要な状態（state / PKCE verifier / 招待コード）を `req.session` から読み書きしない。
3. The Backend Application shall X OAuth のために導入されていた session 依存資産（`x-register-start` の session 書き込み・`x.strategy` の `state:true`/`pkce:true` 由来の session 利用）を残さない。
4. Where MCP 認可フローのハンドオフ（ログイン完了後の `mcpUserId` 注入）が共通コールバックに残存する, the OAuth Callback Handler shall その session 書き込みが MCP 認可フロー専用であり OAuth ログイン／招待登録の成立条件には不要であることを明示し、X を含む全プロバイダの認証成立が当該 session 書き込みの成否に依存しない状態を維持する。
5. Where cookie-session ミドルウェアおよび `SESSION_SECRET` / `SESSION_COOKIE_*` が MCP 認可フローのために残存する, the Backend Application shall その残存理由が MCP 認可フロー専用であることをコメント等で明示し、OAuth ログインフローがそれに依存しない状態を維持する。

### Requirement 4: 暗号処理と鍵管理

**Objective:** セキュリティ担当として、新規に導入する PKCE verifier の暗号化・復号と鍵を安全に管理したい。これにより、署名 state を持ち回る方式でも機密が漏洩しないようにする。

#### Acceptance Criteria

1. The OAuth Flow shall `code_verifier` の暗号化・復号に、改ざんと盗聴の双方を防ぐ認証付き暗号方式を用いる。
2. The OAuth Flow shall 署名・暗号化に用いる鍵を環境変数から取得し、コードにハードコードしない。
3. The Project Configuration shall 署名・暗号化に必要な環境変数を `.env.example` に記載する。
4. If 署名・暗号化に必要な鍵が未設定のまま本番環境で起動する, then the Backend Application shall 起動時に検知可能なエラーまたは警告を出力する。
5. The OAuth Flow shall 署名 state に有効期限を設け、期限を過ぎた state を用いたコールバックを拒否する。

### Requirement 5: 既存の認証挙動の不変保証

**Objective:** エンドユーザーとして、リファクタ前後で認証体験が一切変わらないことを保証してほしい。これにより、内部リファクタがユーザー影響を生まないようにする。

#### Acceptance Criteria

1. When いずれかのプロバイダで認証が成立する, the OAuth Flow shall リファクタ前と同一のユーザー識別・JWT 発行・リダイレクト挙動を維持する。
2. When 招待コード経由でいずれかのプロバイダの登録を開始する, the OAuth Flow shall 招待コードを署名 state で引き継ぎ、コールバック時に解決して登録に用いる。
3. If コールバック時に署名 state が一致しない、欠落している、または検証に失敗する, then the OAuth Flow shall 認証を拒否し、ユーザーをエラーとして扱う。
4. While いずれかの OAuth プロバイダが未構成（Client ID / Secret が空）, the OAuth Flow shall 既存どおり警告ログを出して起動を継続し、当該プロバイダのログイン要求に対して構成不備を示す応答を返す。
5. The OAuth Flow shall `oauth-session-durability` で確定した X の正規ログイン・招待登録の成立条件を、ステートレス方式へ移行したうえでも満たす。

### Requirement 6: セキュリティ構成の整合と回帰防止

**Objective:** セキュリティ担当として、session 撤去後も既存のセキュリティ構成とクロスオリジン構成が崩れないことを保証したい。これにより、リファクタによる退行を防ぐ。

#### Acceptance Criteria

1. The Backend Application shall 既存の helmet（CSP 含む）・CORS（`credentials: true`）・cookie-parser・Refresh Token Cookie 系統の構成と矛盾しない状態を維持する。
2. The OAuth Flow shall 本番のクロスオリジン構成（mosaku.jp ↔ api.mosaku.jp）で X を含む全プロバイダのリダイレクトが成立する状態を維持する。
3. The OAuth Flow shall 5 プロバイダそれぞれのログインおよび招待登録が成立することを検証する自動テストを備える。
4. The OAuth Callback Handler shall 署名 state の検証失敗・PKCE verifier の復号失敗・state 期限切れの各拒否経路を検証する自動テストを備える。
