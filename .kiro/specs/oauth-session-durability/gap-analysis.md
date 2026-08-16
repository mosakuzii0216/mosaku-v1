# Gap Analysis: oauth-session-durability

> 承認済み要件（requirements.md）と既存コードベースの差分分析。design フェーズの意思決定を支援するための情報提供であり、実装方式の最終決定ではない。

## 1. 現状調査（Current State）

### 1.1 セッション基盤

| 項目                   | 現状                                                                                          | 参照                           |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| セッションミドルウェア | `express-session`（`^1.18.1`）を `main.ts` で適用。**`store` 未指定＝デフォルト MemoryStore** | `backend/src/main.ts:42-54`    |
| Cookie 属性            | `secure: isProduction` / `httpOnly: true` / `sameSite: 'lax'` / `maxAge: 1h`                  | `backend/src/main.ts:47-52`    |
| trust proxy            | `set('trust proxy', 1)` 設定済み（Cloud Run/GCLB 配下で secure cookie が機能する前提あり）    | `backend/src/main.ts:76`       |
| session secret         | `SESSION_SECRET` を env から取得し**未設定なら fail-fast（throw）**。dev/prod 問わず必須      | `config.service.ts:114-122`    |
| `.env.example`         | `SESSION_SECRET` 記載済み（L33）                                                              | `.env.example:33`              |
| 導入済みストア用 dep   | **なし**（`cookie-session` / `connect-pg-simple` / `pg` / `connect-redis` いずれも未導入）    | `backend/package.json`         |
| Prisma Session モデル  | **なし**                                                                                      | `backend/prisma/schema.prisma` |

### 1.2 OAuth フローの 2 系統（重要）

本プロジェクトの OAuth は **session 依存度が 2 系統に分裂** している。

1. **HMAC 署名 state 系（Google / GitHub / LINE / Apple、X も start 経路）** — `InvitationStateService.issueState()` が `{code, provider, nonce, iat}` を base64url + HMAC-SHA256 で署名し、`generateOAuthAuthorizationUrl()` で `state` クエリに載せる。**session 非依存・完全ステートレス**。コールバックは `runOAuthCallbackWithStateSupport()` が `req.query.state` / `req.body.state` を `verifyState()` で検証。
   - 参照: `invitation-state.service.ts:28-39`、`auth.controller.ts:99-214`、`config.service.ts:276-323`
2. **passport-oauth2 session 系（X の `GET /auth/x` 経路のみ）** — `x.strategy.ts:34-35` で `pkce: true` + `state: true`。passport-oauth2 が **CSRF state と PKCE `code_verifier` を `req.session` に保存**。コールバック `GET /auth/x/callback` は `XAuthGuard`（passport）が session から取り出して照合。**ここが MemoryStore 依存＝複数インスタンスで散発失敗の真因**。
   - 参照: `x.strategy.ts:27-36`、`oauth-auth.guards.ts:22`、`auth.controller.ts:651-666`

### 1.3 既存セキュリティ構成（整合対象）

- `helmet`（CSP 含む、`crossOriginEmbedderPolicy: false`）— `main.ts:24-36`
- CORS `credentials: true` / origin は `CORS_ORIGINS` env — `main.ts:57-61`、`config.service.ts:70-78`
- `cookie-parser` 適用済み — `main.ts:39`
- Refresh Token Cookie は別系統（`RefreshCookieHelper` + `refreshCookieOptions`、`path:/auth`、SameSite/secure を env で上書き可能）— クロスオリジン（mosaku.jp ↔ api.mosaku.jp）対応の前例あり。`config.service.ts:227-242`

## 2. 要件 → 資産マッピング（Gap タグ: ✅実装済 / 🟡部分 / 🔴未実装 / 🔍要調査）

| 要件 | 内容                                                 | 状態       | 根拠・ギャップ                                                                                                                                   |
| ---- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1  | MemoryStore を使わず全インスタンス共有ストアを使用   | 🔴         | 現状 `store` 未指定＝MemoryStore。新ストア導入が必須                                                                                             |
| 1.2  | 起動時に永続化バックエンドで session を構成          | 🔴         | `main.ts` の session() に store を渡す改修が必要                                                                                                 |
| 1.3  | 本番で MemoryStore フォールバック禁止＋未構成検知    | 🔴         | 現状フォールバック検知ロジックなし                                                                                                               |
| 1.4  | 別インスタンスから同一セッション値を解決             | 🔴         | ストア共有化の核心。方式により実現手段が異なる                                                                                                   |
| 1.5  | 他4プロバイダ・session 非依存挙動を不変              | 🟡(制約)   | 他4つはステートレスなので原理的に影響小。回帰テストで担保                                                                                        |
| 2.1  | X の state + PKCE verifier を共有ストアに保存        | 🔴         | passport の session 保存先を共有化（store 差し替え）で対応                                                                                       |
| 2.2  | 別インスタンス到達でも state/verifier を解決         | 🔴         | 同上                                                                                                                                             |
| 2.3  | state 不一致/欠落で認証拒否                          | 🔴(誤動作) | 「拒否」は過剰動作中。X は**正規 callback でも** controller が passport state を招待 state と誤認し常時拒否（発見 A）。design で正経路確定が前提 |
| 2.4  | 成立時のユーザー識別・JWT・redirect 不変             | 🟡(制約)   | `oauthService.xLogin` / `xRegisterWithStateInvitation` 経路を維持                                                                                |
| 2.5  | 未構成時は警告ログ＋構成不備応答                     | ✅         | `x.strategy.ts:38-43` 警告ログ、`validate()` で `ServiceUnavailableException`                                                                    |
| 3.1  | 本番で `secure:true`/`httpOnly:true`                 | 🟡         | 既に設定済（`secure:isProduction`）。新ストア/Cookie 方式でも維持が必要                                                                          |
| 3.2  | sameSite をクロスオリジンと整合                      | 🔍         | 現状 `lax`。X コールバックは twitter.com→api からのトップレベル GET ナビゲーションのため lax で送出されるが、要検証                              |
| 3.3  | helmet / CORS / cookie-parser と矛盾しない           | 🟡(制約)   | 既存構成と共存設計が必要                                                                                                                         |
| 3.4  | Cookie 方式採用時、payload がサイズ上限内            | 🔍         | state(数十B)+PKCE verifier(43–128 char) は 4KB 上限に十分収まる見込み。要実測                                                                    |
| 3.5  | Cookie 有効期間が OAuth 完了に十分かつ過度でない     | 🟡         | 現状 `maxAge:1h`。署名 state 側は `STATE_MAX_AGE_MS=10分`。整合性検討                                                                            |
| 4.1  | session secret を env 取得・ハードコード禁止         | ✅         | `SESSION_SECRET` env + fail-fast 済                                                                                                              |
| 4.2  | secret/永続化 env を `.env.example` 記載             | 🟡         | `SESSION_SECRET` は記載済。pg 方式採用なら追加 env を追記要                                                                                      |
| 4.3  | 本番で secret 未設定なら検知可能なエラー/警告        | ✅         | 現状は dev/prod 問わず throw（要件より強い）                                                                                                     |
| 4.4  | pg 方式採用時、session テーブルの TTL/クリーンアップ | 🔴(条件付) | pg 方式を選んだ場合のみ。`@nestjs/schedule` の cron 前例あり（trash-cleanup）                                                                    |
| 4.5  | pg 方式採用時、DATABASE_URL/DIRECT_URL 方針と整合    | 🔴(条件付) | pg 方式選択時のみ。pgbouncer(6543) と connect-pg-simple の相性は要調査                                                                           |

## 3. 実装アプローチ案

> 要件の【ゴール】が「第一候補=署名付き Cookie ベース、次点=connect-pg-simple」と明示。
> 【対象外】に「PKCE verifier の署名 state 移植（完全 stateless 化）」が明記されているため、**X の passport `state:true/pkce:true` 機構は維持し、その保存先（store）だけを差し替える**のが本 spec のスコープ。

### Option A: 署名付き Cookie ベースの session ストア（第一候補）

`express-session` の MemoryStore を、セッション本体を Cookie に格納する方式へ置換。具体的には `cookie-session` ミドルウェア導入、または express-session 互換の Cookie ストア実装。

- **変更点**: `main.ts` の session 設定、新規 dep（`cookie-session`）、`config.service` に Cookie 方式の属性を集約
- **トレードオフ**:
  - ✅ サーバーストア不要＝インスタンス間共有が原理的に成立。インフラ追加ゼロ
  - ✅ 既存のステートレス思想（HMAC 署名 state）と整合的
  - ❌ `cookie-session` は `req.session` の API が express-session と一部非互換（`regenerate`/`save` 等）。passport-oauth2 の SessionStore / `req.login` との互換性検証が必須（🔍要調査）
  - ❌ Cookie 署名鍵ローテーション時に進行中フローが無効化
- **Effort**: S–M / **Risk**: Medium（passport 互換性が読み切れない）

### Option B: connect-pg-simple（Supabase Postgres、次点）

既存 Supabase Postgres に session テーブルを作り、`connect-pg-simple` を express-session の store に設定。

- **変更点**: 新規 dep（`connect-pg-simple` + `pg`）、session テーブル（Prisma migration or ライブラリ DDL）、TTL/prune 設定、env（接続文字列）、`main.ts`
- **トレードオフ**:
  - ✅ express-session の API をそのまま維持＝passport 互換性リスクが最小
  - ✅ Cookie サイズ問題が原理的に発生しない
  - ❌ インフラ依存増（DB 書き込み/レイテンシ）、TTL クリーンアップ運用が必要（Req 4.4）
  - ❌ pgbouncer(6543, transaction pooling) と session store の相性、DIRECT_URL(5432) 利用要否が要調査（Req 4.5、🔍）
- **Effort**: M / **Risk**: Medium

### Option C: ハイブリッド（env で方式切替）

env フラグで Cookie 方式（既定）/ pg 方式を選択可能にし、本番は Cookie、将来 DB 永続が必要になれば pg へ。

- **トレードオフ**: ✅ 段階移行・ロールバック容易 ❌ 2 経路の保守コスト・テスト面積増。現スコープには過剰の可能性
- **Effort**: M–L / **Risk**: Medium

## 3.5 深掘り調査結果（要調査項目 1・2 の決着）

> 「X は今どこまで動くのか」「cookie-session は passport と噛み合うか」をコード実体で検証した結論。**spec の前提が一部覆る重要な発見**を含む。

### 発見 A（🔴 重大）: X ログインは複数インスタンス以前に「両フローとも壊れている」

X には**配線の異なる 2 フロー**が存在し、**どちらも単一インスタンスでも成立しない**ことを確認した。

- **Flow A（既存ログイン）**: `OAuthLoginButton` → `useAuth().xLogin()` → `oauth.startLogin('x')` → `XAuthUtils.startXAuth()` → `window.location=/auth/x`（`frontend/src/utils/oauthAuth.ts:98`、`hooks/useOAuth.ts:49-53`）。
  1. passport-oauth2 が `state:true/pkce:true` でランダム state + PKCE verifier を `req.session` に保存（`node_modules/passport-oauth2/lib/state/pkcesession.js:38-48`）。
  2. callback で passport は session から照合し、**同一インスタンスなら passport は成功**する。
  3. **その直後**、controller `runOAuthCallbackWithStateSupport('x', …)` が `req.query.state`（＝passport のランダム state）を拾い `invitationStateService.verifyState(ランダムstate, 'x')` を実行 → HMAC 署名形式でないため**必ず throw → `error=invalid_state` リダイレクト → ログイン失敗**（`auth.controller.ts:148-197`）。
  - ⇒ **session が生きていても controller 層で必ず弾かれる。** 複数インスタンスの session 喪失は「その奥の 2 個目のバグ」に過ぎない。
- **Flow B（招待新規登録）**: `/invite/:code` → `POST /auth/oauth/x/start` → 手組み authorizationUrl → callback。
  1. `generateOAuthAuthorizationUrl('x')` がダミー PKCE（`code_challenge:'challenge'` / `plain`）＋署名 state で URL 生成。**session には何も書かず、本物の verifier も生成しない**（`config.service.ts:310-319`）。
  2. callback で `XAuthGuard`(passport) が session に自分が保存したはずの state/verifier を探すが、start を passport 経由していないため**session は空** → "Unable to verify authorization request state" で **guard が 401。handler に到達すらしない**（`pkcesession.js:63-73`）。

- **なぜ他 4 プロバイダは平気か**: X **のみ** `state:true` を付与しているため passport が state を所有する。他 4 つは passport が state 検証をしない → ログイン時は callback に state が無く controller の「state なし」分岐で素直に login（`auth.controller.spec.ts:439` でテスト済）、招待時は passport 素通り後に controller が署名 state を検証して register。**X だけ「passport が state を所有する」唯一の例外**であり、controller は「passport は state を所有しない」前提で書かれている——この設計矛盾が根本原因。
- **テストの盲点**: 既存 `auth.controller.spec.ts:489-517` は `verifyState` を**モックで成功**させており、この実バグを検知できない。X の「state なし（Flow A）」テストも存在しない。

→ **結論: 「session ストア差し替えだけ」では X ログインは直らない。** Flow A の controller 二重 state 解釈と Flow B のダミー PKCE＋guard 不整合を design で必ず解消する必要がある。これは本 spec の要件（特に Req 2）の前提を実質的に書き換える。

### 発見 B（🟢 解消）: cookie-session × passport-oauth2 は互換、リスク低

要調査項目 1 はコード実体で「行ける」と決着。

- アプリ全体で `req.session` を使うのは **passport-oauth2 の PKCEStateStore のみ**（`serializeUser`/`deserializeUser`/`req.login` の登録はゼロ、全文 grep 済）。
- PKCEStateStore は `req.session[key]` の**プレーンオブジェクト get/set/delete しかしない**（`regenerate`/`save`/`reload` を呼ばない）。
- `@nestjs/passport` の `defaultOptions` は **`session: false` 確定**（`node_modules/@nestjs/passport/dist/options.js`）。Guard は custom callback 経由で authenticate するため **`req.login` → `req.session.regenerate` は呼ばれない**。
- ⇒ cookie-session が提供する「プレーンな `req.session` ＋自動シリアライズ」で必要十分。**Option A 最大の不安だった互換性リスクは実質ゼロ**。
- design 留意点: cookie-session 既定は署名のみ非暗号。PKCE verifier がクッキーバイト列に載るが `httpOnly` で JS から不可読・verifier は自ブラウザ内に留まる値のため実害なし。気になる場合は `keys` 暗号化を検討（verifier の署名 state 移植は**スコープ外**）。

## 4. 要調査項目（Research Needed → design フェーズへ）

1. ~~passport-oauth2 × cookie-session 互換性~~ → **発見 B で解消（互換・リスク低）**。
2. **X の正経路 → 【決定: 案 (b)】**: X は passport 経路（`state:true/pkce:true` の session 方式）に一本化し、(1) controller `runOAuthCallbackWithStateSupport` が passport の CSRF state と招待署名 state を**構造で判別**して誤認をやめる、(2) 招待登録の X は session に招待コードも積んで往復させる、(3) `/auth/oauth/x/start` のダミー PKCE 経路は撤去 or 作り直し。session 永続化（Option A）で多インスタンス耐性を確保。
   - 不採用: 案 (a)「X も署名 state 方式へ寄せ PKCE verifier を署名 state に移植し 5 社統一＋session 撤去」は、本 spec のスコープ外（自前 crypto・4 社巻き込み・Effort L）のため**将来の別 spec**として切り出す（要件 §対象外で既に言及済の路線）。理由: (b) で X ログイン不具合と多インスタンス耐性は解消でき、(a) はユーザー影響のない内部リファクタで優先度低。
3. **`.env.example` の X キー名不一致**: config は `X_CLIENT_ID`/`X_CLIENT_SECRET` を読むが、`.env.example` は `X_CONSUMER_KEY`/`X_CONSUMER_SECRET`（L106-108、"currently disabled" コメント付き）。X を有効化するなら env キー名の統一が前提。
4. **sameSite とクロスオリジン**（Req 3.2）: X コールバックのトップレベル GET ナビゲーションで lax/none どちらが必要か実測。secure cookie + trust proxy の Cloud Run 実機検証。
5. **Cookie payload サイズ**（Req 3.4, Option A 時）: state + PKCE verifier の実測サイズと 4KB 上限の余裕確認。
6. **pg 方式の TTL/接続方針**（Req 4.4/4.5, Option B 時）: prune 間隔、pgbouncer 経由可否、DIRECT_URL 利用要否。

## 5. design フェーズへの推奨

- **前提の見直し（最重要）**: 発見 A により、X は複数インスタンス以前に**両フローとも未成立**。本 spec を「session 永続化」だけで閉じると **X ログインは直らない**。store 差し替え（多インスタンス耐性）は必要だが**単独では不十分**で、X の controller 二重 state 解釈＋ダミー PKCE の解消が必須。
- **【方針確定】X 正経路 = 案 (b)**（passport 経路一本化＋controller の state 判別修正）。案 (a)（5 社統一・session 撤去）は**将来の別 spec**へ切り出し。
- **推奨アプローチ**: store 方式は **Option A（Cookie ベース）を本命**（互換性は発見 B で解消済、リスク低）。NG 要因が出れば Option B（pg）へフォールバック。これと**並行して** X の controller 二重 state 解釈バグ＋ダミー PKCE を design で解消。
- **既に満たされている要件**（2.5 / 4.1 / 4.3 と 4.2 の一部）は「現状維持＋回帰テストで担保」と明記し重複実装を避ける。※ 2.3 は X では**誤動作中**のため除外（発見 A）。
- **スコープ境界の再確認**: 「PKCE verifier の署名 state 移植」は対象外（案 (a) の将来 spec で扱う）。本 spec は (b)＋store 差し替えに閉じる。

---

## Analysis Summary

- **スコープ核心**: X のみ passport-oauth2 `state:true/pkce:true` で `req.session`（=デフォルト MemoryStore）に CSRF state と PKCE verifier を保存しており、Cloud Run 複数インスタンスで散発失敗。他4プロバイダは HMAC 署名 state で既にステートレス。
- **本質的対応**: passport の session 機構は維持しつつ **store を共有可能方式へ差し替え**（Cookie or pg）。完全 stateless 化（verifier の署名 state 移植）は明示的に対象外。
- **既達部分あり**: `SESSION_SECRET` の env 化・fail-fast・`.env.example` 記載、X 未構成時の警告ログ、state 不一致拒否は既に実装済。重複実装に注意。
- **深掘りで判明（§3.5）**: ① **X ログインは複数インスタンス以前に両フローとも未成立**（Flow A=controller が passport state を招待 state と誤認し常時拒否 / Flow B=guard が空 session で 401＋ダミー PKCE）。② cookie-session × passport は**互換・リスク低**（`req.session` 利用は PKCEStateStore のみ、`req.login`/`regenerate` 不使用、`session:false` 確定）。③ `.env.example` の X キー名不一致（`X_CONSUMER_*` vs config の `X_CLIENT_*`）。
- **インパクト**: 「session 永続化だけ」では X は直らない。store 差し替え（Option A 本命）に**加えて** X の controller 二重 state 解釈＋ダミー PKCE を design で解消必須。X 正経路の確定は要件 Owner との合意事項。
- **推奨**: Option A 本命 + NG 時 Option B。ただし X 正経路確定を含めると **Effort M、Risk Medium→High**（spec 前提の変更を伴うため）。

## Document Status

- ギャップ分析を `gap-analysis.md` に生成（言語: spec.json の `ja`）。
- gap-analysis.md フレームワーク（現状調査 → 要件実現性 → A/B/C 案 → Effort/Risk → 研究項目）に準拠。

## Next Steps

1. 本分析と要件の整合を確認。
2. `/kiro:spec-design oauth-session-durability` で技術設計を作成（または `-y` で要件自動承認のうえ設計へ）。
3. design では特に **研究項目 1・2** の決着を最優先で。
