# Implementation Plan

## oauth-stateless-unification

---

- [x] 1. ステートレス基盤（暗号・PKCE・署名 state）を構築する（Phase 1 基盤 / 4 社挙動不変）
- [x] 1.1 OAuth state 暗号鍵の供給と環境変数を整備する
  - `ConfigService` に `oauthStateEncKey` getter を新設し、`OAUTH_STATE_ENC_KEY`（hex 64 字 = 32 byte）を decode・長さ検証する
  - 未設定または長さ不正の場合は起動時に fail-fast する（既存 `invitationStateSecret` の fail-fast 前例に倣う）
  - HMAC 署名鍵 `INVITATION_STATE_SECRET`（既存）と暗号鍵を用途分離して保持する
  - `.env.example` に `OAUTH_STATE_ENC_KEY` の用途・生成方法（32 byte hex）を追記する
  - getter の長さ検証 fail-fast をユニットテストで固定する
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 1.2 (P) PKCE の verifier 生成と S256 challenge 算出を実装する
  - `code_verifier` を base64url(randomBytes(32))（43 文字固定）で生成する
  - `code_challenge` を base64url(sha256(verifier)) として算出する（S256）
  - `challenge === base64url(sha256(verifier))` と verifier 長 43 をユニットテストで固定する
  - 既存 state/暗号層に依存しない独立コンポーネントとして実装する（並行実装可）
  - _Requirements: 2.1_

- [x] 1.3 verifier の AEAD 封緘・開封を実装する
  - AES-256-GCM で `seal(plaintext)` を実装し、12 byte ランダム IV を生成して `iv || ciphertext || authTag(16)` を base64url で返す
  - `open(sealed)` で IV/tag を分離して復号し、auth tag 不一致（改ざん）時は例外を投げる
  - 暗号鍵は 1.1 の `oauthStateEncKey` を使用し、IV は毎回ランダムで鍵との再利用を禁止する
  - `open(seal(x)) === x`、tag 破壊で throw、鍵不一致で throw をユニットテストで固定する
  - タスク 1.1 の完了後に実施する（暗号鍵 getter に依存）
  - _Requirements: 2.2, 2.5, 4.1_

- [x] 1.4 署名+暗号+TTL を備えた汎用 OAuth state サービスへ昇格する
  - 既存 `InvitationStateService` を `OAuthStateService` へ昇格・改名し、base64url + HMAC-SHA256 + TTL ロジックを再利用する
  - `code`（招待コード）と `verifier`（PKCE）を任意フィールド化し、`provider`・`nonce`・`iat` とともに短キー JSON（`v,p,c,n,t,ev`）へ符号化する
  - `verifier` が渡された場合のみ AEAD で封緘して `ev` に格納し、`verifyState` 時に開封して平文 verifier を復元する
  - HMAC 署名検証（timing-safe）→ provider 一致 → TTL（既定 10 分）の順で検証し、いずれか失敗で例外を投げる
  - 招待コード抽出ヘルパーは署名検証前の base64url デコードのみ行い、短キー `c` と旧 `code` の両方を読む
  - wire 後方互換として旧長キー payload（`code,provider,nonce,iat`）も `verifyState` で受理する（1 リリース限定の飛行中 state 救済）
  - 既存 4 社の呼び出し箇所を新サービス名・新シグネチャへ追従させ、挙動を変えない
  - code あり/なし・verifier あり/なしの往復、TTL 超過拒否、provider 不一致拒否、HMAC 改ざん拒否、X state が 500 文字以内をユニットテストで固定する
  - タスク 1.3 の完了後に実施する（封緘/開封に依存）
  - _Requirements: 1.2, 1.4, 2.2, 2.3, 2.4, 4.5, 5.2, 5.3_

- [x] 1.5 X の authorize URL 生成口を統一生成器へ追加する
  - `generateOAuthAuthorizationUrl` に `x` ケースを実装し、`response_type=code`・`scope=tweet.read users.read`・`code_challenge`・`code_challenge_method=S256`・`state` を組み立てる
  - 署名 state を受け取る signature へ `codeChallenge` 引数を追加し、4 社の既存生成は無変更で維持する
  - X 向けの従来の例外送出を撤去する
  - `generateOAuthAuthorizationUrl('x', …)` に `code_challenge`/`code_challenge_method=S256` が載ることをユニットテストで固定する
  - タスク 1.1 と同じ `ConfigService` を変更するため 1.1 完了後に実施する
  - _Requirements: 1.2, 2.1, 5.4_

---

- [x] 2. X を手組みステートレスフローへ移行する（Phase 2 X 移行）
- [x] 2.1 (P) X の token 交換・profile 取得サービスを実装する
  - `code` と復号済み `verifier` を用い、X token エンドポイントへ confidential client（`Authorization: Basic base64(id:secret)`）として token 交換する
  - 取得した access token で profile（`users/me?user.fields=profile_image_url`）を取得し、`XStrategyUser`（`xId`・`name`・`username?`・`picture?`・`accessToken`）へマッピングする（`email` は X から取得せず undefined）
  - session に一切触れず、token/profile の非 2xx・ネットワーク失敗は例外を投げる
  - `isConfigured()` を実装し、client id/secret 未設定で false を返す（起動時警告継続・認証要求時は構成不備として扱う）
  - scope・host は既存 X 定数（`tweet.read users.read`）を踏襲する
  - `fetch` mock で token→profile→`XStrategyUser` マッピング、token 4xx / profile 4xx で throw、未構成で `isConfigured()===false` をユニットテストで固定する
  - Phase 1 の state/暗号層に依存しない（平文 verifier を入力として受け取る）ため並行実装可。controller への配線は 2.4 で行う
  - _Requirements: 1.1, 1.5, 2.3, 3.1, 5.4_

- [x] 2.2 プロバイダ分岐を持たない共通コールバック finalize を抽出する
  - `finalizeOAuthCallback` を新設し、`payload.code` の有無のみで招待登録/ログインを選び、refresh cookie 設定・成功 redirect を行う（プロバイダ分岐なし）
  - 既存 4 社の `runOAuthCallbackWithStateSupport` を `finalizeOAuthCallback` へ集約し、4 社の挙動を変えない
  - MCP ハンドオフ（`mcpAuthorizeReturn` 時の `mcpUserId` 注入）は不変で温存し、認証成立がこの session 書き込みの成否に依存しないことを保証する
  - 認証成立経路で `req.session` を読み書きしないことを保証する
  - タスク 1.4 完了後に実施する（新 `verifyState` シグネチャに依存）
  - _Requirements: 1.3, 3.2, 3.4, 5.1_

- [x] 2.3 X の認証開始フローを手組み化する
  - `POST /auth/oauth/x/start`: 招待コード検証後に PKCE pair 生成 → `issueState({provider:'x', code, verifier})` → 統一生成器で authorize URL を返す（返却 `{authorizationUrl}` 契約は不変）
  - `GET /auth/x`（通常ログイン）: passport guard を廃し、PKCE pair 生成 → `issueState({provider:'x', verifier})`（code なし）→ X authorize URL へ 302 する
  - verifier は署名 state 内（暗号化）にのみ持ち、session には保存しない
  - 4 社の start 経路（`issueState({provider, code})` → URL 生成）は無変更で維持する
  - タスク 1.2・1.4・1.5 完了後に実施する。2.2・2.4 と同じ controller を変更するため逐次実施
  - _Requirements: 1.1, 1.2, 2.2_

- [x] 2.4 X のコールバックを手組み化して共通 finalize へ合流させる
  - `GET /auth/x/callback`: guard を廃し、`verifyState(state, 'x')` → token/profile 交換サービス → `finalizeOAuthCallback` で処理する
  - state 欠落は `auth_failed`、`verifyState` 失敗（HMAC 不一致 / TTL 超過 / provider 不一致 / verifier 復号失敗）は invite ページ（code 復号可時）または `auth_failed` へ落とす
  - 認証成立経路で `req.session` を読み書きしない
  - 4 社のコールバックも state を取り出し `verifyState`（verifier なし）→ `finalizeOAuthCallback` を通ることを確認する
  - タスク 2.1・2.2 完了後に実施する（token/profile サービスと finalize に依存）
  - _Requirements: 1.1, 2.3, 2.4, 3.1, 5.3_

---

- [ ] 3. session 依存資産を撤去し cookie-session を MCP 専用へ縮退する（Phase 3 session 撤去）
- [ ] 3.1 X の passport・register-start 関連資産を撤去する
  - `x.strategy.ts`（+spec）・`XAuthGuard`・`x-register-start.guard.ts`（+spec）・`x-register-start.exception.ts`・`x-register-start.filter.ts`・`x-cookie-session-gate.spec.ts` を削除する
  - `GET /auth/x/register-start` ルートと `generateXRegisterStartUrl` を撤去する
  - `auth.module.ts` の providers/exports から撤去クラスを除去し、passport-oauth2 / twitter-oauth2 への X 依存を排除する
  - Phase 2（2.3・2.4）完了後に実施する（X が passport を使わなくなった後）
  - _Requirements: 1.5, 3.3_

- [ ] 3.2 cookie-session を MCP 認可フロー専用へ縮退・明示する
  - `main.ts` の cookie-session ミドルウェアコメントを「MCP 認可フロー専用」へ更新し、OAuth ログインが非依存である旨を明示する（適用順序 helmet → cookie-parser → cookie-session → CORS は不変）
  - `ConfigService` の `sessionSecret` / `sessionCookieOptions` に MCP 専用注記を付して残置する
  - helmet/CSP・CORS（`credentials:true`）・cookie-parser・Refresh Cookie 系統の構成を変更しない
  - タスク 3.1 と同じ `ConfigService` を変更するため 3.1 完了後に実施する
  - _Requirements: 3.5, 6.1_

---

- [ ] 4. 統合テストと回帰・クロスオリジン検証を実施する
- [x] 4.1 5 社 × (ログイン / 招待登録) のコールバック routing を統合テストする
  - `auth.x-flow.integration.spec.ts` を stateless X 用に再構成する
  - X ログイン（code なし → `xLogin`）/ X 招待（code あり → `xRegisterWithStateInvitation`）が成立することをテストする
  - Google / GitHub / LINE / Apple の各ログイン・招待登録が署名 state 経路で成立することをテストする
  - 招待コードが署名 state で引き継がれコールバックで解決されることをテストする
  - _Requirements: 5.2, 5.5, 6.3_

- [ ] 4.2 state / verifier / TTL の拒否経路を統合テストする
  - 不正 state（HMAC 不一致・不正形式・provider 不一致）が認証拒否で終わることをテストする
  - verifier の AEAD 復号失敗が認証拒否で終わることをテストする
  - state TTL 超過が認証拒否で終わることをテストする
  - いずれもログイン成立へフォールスルーしないことを確認する
  - _Requirements: 2.4, 4.5, 5.3, 6.4_

- [ ] 4.3 MCP ハンドオフ不変と 4 社回帰を検証する
  - `mcpAuthorizeReturn` ありで `mcpUserId` 注入が温存され、X を含む認証成立が session 書き込みの成否に依存しないことをテストする
  - `runOAuthCallbackWithStateSupport` の 4 社 state 経路が従来どおり（ユーザー識別・JWT 発行・リダイレクト不変）であることを回帰テストで固定する
  - _Requirements: 3.4, 5.1, 5.5_

- [ ] 4.4 本番クロスオリジンで 5 社のリダイレクト成立を検証する
  - 本番相当のクロスオリジン構成（mosaku.jp ↔ api.mosaku.jp）で X を含む 5 社の authorize リダイレクトと callback 成立を E2E / 手動で検証する
  - `X_REDIRECT_URI` が既存 callback URL と一致することを確認する
  - _Requirements: 5.5, 6.2_
