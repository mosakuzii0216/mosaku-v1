# Research & Design Decisions: viral-invitation

---

## Summary

- **Feature**: `viral-invitation`
- **Discovery Scope**: Complex Integration（OAuth 5プロバイダ × 認可フロー逆転 × DBマイグレーション × フロント新規ルート）
- **Key Findings**:
  - **passport-oauth2 には `store` オプションがあり、任意のアプリケーション state（招待コード）を state パラメータに安全に乗せて、コールバックで自動復元できる**。CSRF 用 nonce は内部で別途生成・検証されるため、CSRF 耐性は維持される。これにより 5プロバイダ（Google/GitHub/LINE/Apple/X）統一の引き継ぎ実装が可能
  - **nanoid の no-look-alike alphabet（49文字）を 10文字長で使用**すれば、49^10 ≈ 8京通りの空間で、視認性と推測耐性を両立できる。SNS共有・口頭伝達の両方に耐える
  - **Web Share API は Chrome / Edge / iOS Safari / macOS Safari でフル対応**、Firefox 限定。`navigator.canShare()` で feature detection → `navigator.clipboard.writeText()` フォールバックの 2段階で全環境カバー可能。HTTPS 必須（mosaku.jp は HTTPS）

---

## Research Log

### OAuth state パラメータによるアプリケーション state 引き継ぎ

- **Context**: Requirement 3「OAuth 順序の逆転」で、招待コードを OAuth プロバイダ往復の間引き継ぐ必要がある。5プロバイダ全てで安全かつ統一された手段が必要
- **Sources Consulted**:
  - [Application State in OAuth 2.0 — Passport.js (Medium)](https://medium.com/passportjs/application-state-in-oauth-2-0-1d94379164e)
  - [passport-google-oauth2 GitHub](https://github.com/jaredhanson/passport-google-oauth2)
  - [passport-oauth2 Issue #164: state insecure by default](https://github.com/jaredhanson/passport-oauth2/issues/164)
- **Findings**:
  - `state: true` オプションは passport-oauth2 が nonce を生成しセッションに保存・検証する（CSRF 防御）
  - **`store` オプション**を併用すると、`passport.authenticate(provider, { state: appStateObject })` で任意のオブジェクトを state に乗せて、コールバックハンドラで `req.authInfo.state` から取り出せる。CSRF nonce はライブラリが自動付与
  - **既定では state 検証が無効**であり、明示的に有効化が必要。issue #164 が指摘するセキュリティ上の落とし穴
  - passport-google-oauth20、passport-github2、passport-twitter-oauth2 は全て passport-oauth2 を継承するため同じ機能を持つ
  - passport-line-auth、passport-apple は別実装だが、いずれも OAuth 2.0 認可フローで state パラメータをサポート
- **Implications**:
  - OAuth 5プロバイダ統一で `store` オプション + 招待コードを appState として渡す方式を採用可能
  - セッションストアは NestJS + passport の既定（`express-session` 互換）が必要。**現状の Mosaku はセッションレス JWT 設計**のため、`express-session` 等の導入が必要 → サーバ側で短期セッションを持つか、別案を検討
  - **代替案**: 招待コードを HMAC 署名付きで state 文字列に直接エンコードする「ステートレス state」方式（短い nonce + 署名付きペイロード）。サーバ側ストア不要

### nanoid 文字集合と長さ

- **Context**: Requirement 2「招待コードの可読性と短縮」で、SNS共有・口頭伝達に耐える短く読み間違いの少ないコードが必要
- **Sources Consulted**:
  - [ai/nanoid GitHub](https://github.com/ai/nanoid)
  - [Nanoid custom alphabet implementation guide](https://app.studyraid.com/en/read/12465/402881/custom-alphabet-implementation)
  - [Random NanoID Generator (miniwebtool)](https://miniwebtool.com/random-nanoid-generator/)
- **Findings**:
  - デフォルト alphabet: `A-Za-z0-9_-` 64文字、URL-safe（エスケープ不要）
  - **no-look-alike alphabet: 49文字**（`0/O`, `1/I/l/L`, `_/-` 等を除外）。ヒューマンリーダブル
  - 49^10 = 約 7.98 × 10^16 通り、49^8 = 約 3.32 × 10^13 通り
  - nanoid バージョン 5.x 系で `customAlphabet` API が安定
  - 衝突確率は出生日問題に従い、50%衝突に到達するID数は `√(N × ln(2))`
- **Implications**:
  - **採用案: nanoid `no-look-alike` 10文字（49^10 ≈ 8京通り）**
  - 想定 mosaku 全体の招待数（≤ 10万件規模）では衝突確率は実質ゼロ
  - URLセーフ（`-`/`_` 除外済）で `/invite/{code}` にそのまま埋め込める

### Web Share API 戦略

- **Context**: Requirement 5「友達招待 UI」で、Settings 画面の共有ボタンから OS ネイティブ共有シートを起動したい
- **Sources Consulted**:
  - [MDN: Navigator.share()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
  - [LogRocket: Advanced guide to Web Share API](https://blog.logrocket.com/advanced-guide-web-share-api-navigator-share/)
  - [Piccalilli: Simplify sharing with built-in APIs](https://piccalil.li/blog/simplify-sharing-with-built-in-apis-and-progressive-enhancement/)
- **Findings**:
  - Chrome / Edge（desktop + mobile）、iOS Safari、macOS Safari でフル対応
  - Firefox: モバイル非対応、デスクトップは限定的
  - **HTTPS（secure context）必須**。ローカル開発は `localhost` で動作
  - `navigator.canShare(data)` で個別データの共有可否を判定可能
  - 推奨パターン: `navigator.share` の存在チェック → 失敗時は `navigator.clipboard.writeText` フォールバック
- **Implications**:
  - 2段階フォールバック構成（Web Share → Clipboard）で全環境カバー
  - mosaku.jp は HTTPS（Vercel デプロイ）、ローカル開発は localhost で確認可

---

## Architecture Pattern Evaluation

| Option                      | Description                                                                     | Strengths                      | Risks / Limitations                         | Notes                                                             |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------- |
| A: 既存サービス内に詰め込み | InvitationService と OAuthService に直接拡張メソッドを追加                      | ファイル数最小                 | OAuthService が肥大化。責務境界が曖昧       | steering「1ドメイン=1モジュール」と整合だが単一クラス肥大は別問題 |
| B: 全部新規モジュール       | InvitationFlowService / InvitationQuotaService / InvitePage 全部新設            | 単一責務徹底                   | ファイル数増・既存パターン外                | NestJS 慣習からは過剰分割                                         |
| **C: ハイブリッド（採用）** | 既存 invitation ドメイン内拡張 + 新規 OAuth state ヘルパー + フロント新規ページ | 責務境界明瞭・既存パターン尊重 | 旧 OAuth フロー削除に伴う既存テスト書き換え | steering 整合性高い、フロントは独立ページで詰め込み回避           |

**選定理由**: Option C は steering の「ドメインモジュール 1:1」を維持しつつ、肥大化リスクのある OAuth state 引き継ぎを別ヘルパーに切り出すバランス案。フロントは `/invite/:code` を独立ページとして責務分離。

---

## Design Decisions

### Decision: OAuth state 引き継ぎ方式

- **Context**: 5プロバイダで招待コードを認可フロー往復に引き継ぐ統一手段が必要。Mosaku は現状セッションレス JWT 設計
- **Alternatives Considered**:
  1. passport-oauth2 `store` オプション（サーバセッション必要）
  2. **HMAC 署名付きステートレス state**（`payload.b64.signature` 形式）
  3. サーバ側に短期 TTL ストア（Redis / DB）を持つ
  4. クエリ文字列に平文で乗せる（CSRF 脆弱、却下）
- **Selected Approach**: **(2) HMAC 署名付きステートレス state**
  - 構造: `{ "code": "k9x7m2j3pq", "nonce": "<16-byte-hex>" }` を base64url + HMAC-SHA256 署名
  - フロント → `/auth/oauth/:provider/start?invitationCode=XXX` を呼ぶ → サーバが state を生成 → passport `authenticate` に渡す → コールバックで署名検証 → 招待コード復元
  - `passport.authenticate(provider, { state: <signed-string> })` で OAuth 認可URLに乗せる
  - CSRF nonce は state ペイロード内で生成・検証
- **Rationale**:
  - Mosaku のセッションレス JWT 設計と整合（`express-session` 追加不要）
  - 5プロバイダで完全に統一可能（passport-oauth2 系 / line / apple すべて state パラメータをサポート）
  - HMAC 秘密鍵は既存の `JWT_SECRET` を再利用可能（鍵分離が必要なら別 env を追加）
  - 状態はクライアント往復のみ、サーバ側ストレージ不要
- **Trade-offs**:
  - ✅ ステートレス・水平スケール容易
  - ✅ 既存 NestJS 構成への追加依存なし
  - ❌ state パラメータが長くなる（base64 + 署名で約 120 文字）→ プロバイダの URL 長制限内（数 KB）に余裕で収まる
  - ❌ 自前で署名検証実装の責任を負う
- **Follow-up**:
  - state 署名鍵を `INVITATION_STATE_SECRET` として別 env に分離するか design 確定時に判定
  - 各プロバイダの strategy 設定で `state: <signed>` を渡せることを統合テストで検証

### Decision: 招待コード生成方式

- **Context**: Requirement 2 で短く読みやすいコードが必要
- **Alternatives Considered**:
  1. nanoid デフォルト alphabet (64文字) × 8文字
  2. **nanoid no-look-alike alphabet (49文字) × 10文字**
  3. UUID v4（36文字、ハイフン含む、視認性悪）
  4. 既存 `randomBytes(16).toString('hex').toUpperCase()` 継続（32文字、長すぎる）
- **Selected Approach**: **(2) nanoid no-look-alike 10文字**
  - `customAlphabet('346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtuvwxy', 10)` 形式
  - 例: `k9x7m2j3pq`
- **Rationale**:
  - 49^10 ≈ 7.98 × 10^16 通りで衝突確率実質ゼロ
  - 紛らわしい文字（`0/O/1/I/l/L`等）除外で口頭伝達も可
  - URL安全（`-/_` を除外しているので prefix 区切りに使える）
- **Trade-offs**:
  - ✅ 視認性・推測耐性両立
  - ❌ nanoid 依存追加（背番号 118 バイトの小型ライブラリ）

### Decision: 旧 OAuth 招待フローの扱い

- **Context**: 既存 `OAuthService.handleOAuthLogin()` の `INVITATION_REQUIRED` throw + 旧エンドポイント `/auth/{provider}/register-with-invitation` × 5本が存在
- **Alternatives Considered**:
  1. 後方互換維持（両フロー並列）
  2. **新フロー稼働後に旧フロー削除（後方互換なし）**
  3. 旧フローを段階的に deprecated 警告 → 別 PR で削除
- **Selected Approach**: **(2) 新フロー稼働後に旧フロー削除（同 spec 内で完結）**
  - 削除対象: `INVITATION_REQUIRED` throw 経路、`/auth/{provider}/register-with-invitation` × 5、`OAuthInviteForm.tsx`、`pending{Provider}User` の sessionStorage、`?error=invitation_required` ハンドラ
- **Rationale**:
  - 旧フロー継続は Requirement 3-6 と矛盾（廃止または無効化）
  - 並列維持は分岐コードが永久に残るコスト高
  - Mosaku はクローズドβで利用者が限定的、移行リスク低
  - Sentry `feature_area: invitation` で旧経路ヒットを監視可能（リリース後ゼロを確認）
- **Trade-offs**:
  - ✅ コードベース簡潔
  - ✅ 1 PR で完結
  - ❌ 既存 spec `auth.controller.spec.ts` の書き換え範囲が大きい（5プロバイダ × 旧フロー）

### Decision: invitationQuota デフォルト値と初期付与戦略

- **Context**: Requirement 4「招待枠」のデフォルト値と既存ユーザーへの付与
- **Alternatives Considered**:
  1. USER=3、ADMIN=null（無制限）
  2. **USER=5、ADMIN=null（無制限）**
  3. ロールに関わらず一律 N
  4. config 化（環境変数）
- **Selected Approach**: **(2) USER=5、ADMIN=null（無制限扱い）**
  - schema: `invitationQuota Int @default(5)`、判定時に `role === 'ADMIN'` なら quota チェックスキップ
  - マイグレーション時: 既存 USER 全員に 5 付与、ADMIN にも 5 付与（無視されるが整合維持）
- **Rationale**:
  - 5 枚あれば自然な口コミ拡散には十分（Superhuman 等の事例で 3〜5 が一般的）
  - ADMIN を `null` でなく既定値で持たせるのは schema 単純化のため
  - 必要なら将来 config 化（環境変数 or ユーザーごと変更）に拡張可能
- **Trade-offs**:
  - ✅ schema シンプル
  - ✅ 既存ユーザーへの一括付与が単純な migration で完結
  - ❌ ロール変更時の quota 再評価ロジックが必要（ADMIN→USER で quota 0 になり得る）→ 設計時に注意

### Decision: 既存 32文字 hex コードの後方互換

- **Context**: 既に発行された旧形式コードの扱い
- **Alternatives Considered**:
  1. **検証受け入れを継続（廃止スケジュールは別 spec）**
  2. マイグレーションで全コードを nanoid 形式に再発行（既存招待者通知が必要）
  3. 一括削除（受信者は無効になる）
- **Selected Approach**: **(1) 検証受け入れ継続**
  - `InvitationCode.code @db.VarChar(50)` は両形式を許容
  - 検証ロジック（`verifyInvitation`）は長さに依存しないため変更不要
- **Rationale**:
  - 移行リスクゼロ
  - クローズドβで既存招待数も少ない
  - 将来の DB クリーンアップは別 spec で扱う
- **Trade-offs**:
  - ✅ ゼロリスク
  - ❌ DB に旧形式コードが残る（許容）

---

## Risks & Mitigations

- **R1: state 署名検証実装の脆弱性** — 自前 HMAC 実装で timing attack やパディング漏れ等の脆弱性混入リスク。**Mitigation**: Node.js 標準 `crypto.timingSafeEqual` を使用、`crypto.createHmac('sha256', secret)` の単純実装に限定、unit test で改ざん検知パスを網羅
- **R2: passport state オプションと自前 state の衝突** — passport-oauth2 の `state: true` を同時有効化すると state パラメータが上書きされる可能性。**Mitigation**: `state: true` は明示的に無効化、`state: <signed-string>` のみを authenticate に渡す。passport 内部の nonce 機能は使わず、自前 state 内 nonce で代替
- **R3: 5プロバイダ間の state パラメータ受け渡し差異** — passport-line-auth / passport-apple は passport-oauth2 派生でない場合の差異。**Mitigation**: 各プロバイダ strategy ごとに state 受け渡しを統合テストで検証、必要なら個別 adapter
- **R4: 既存 32文字hex コードと nanoid コードの混在による調査負荷** — 障害時に「どっち形式？」で迷う。**Mitigation**: コード形式を判定するヘルパー関数を提供、Sentry イベントタグで `invitation_code_format: legacy | nanoid` を付与
- **R5: マイグレーション後の ADMIN→USER ロール降格で quota 0 になる** — 業務オペレーション上の一貫性問題。**Mitigation**: ロール変更時に明示的に quota をリセットするオペレーションを `update-admin-role` 等で定義（同 spec 内で扱う）
- **R6: Web Share API 非 HTTPS 環境での失敗** — ローカル開発で動作確認できないリスク。**Mitigation**: `localhost` は secure context として扱われるため、`npm run dev` で確認可。Clipboard fallback も同等に動作

---

## References

- [Application State in OAuth 2.0 — Passport.js (Medium)](https://medium.com/passportjs/application-state-in-oauth-2-0-1d94379164e) — passport-oauth2 の `store` オプションでアプリケーション state を CSRF nonce と分離して扱える
- [passport-google-oauth2 GitHub](https://github.com/jaredhanson/passport-google-oauth2) — Google OAuth strategy 仕様
- [passport-oauth2 Issue #164](https://github.com/jaredhanson/passport-oauth2/issues/164) — state パラメータの既定無効と CSRF 脆弱性指摘
- [GHSA-6wm6-3vpq-6qvv: Missing state parameter in OAuth2 flows](https://github.com/hedgedoc/hedgedoc/security/advisories/GHSA-6wm6-3vpq-6qvv) — state 欠落の CSRF 攻撃事例
- [ai/nanoid GitHub](https://github.com/ai/nanoid) — nanoid 公式
- [Nanoid Python Custom Alphabet Size Tuning 2026](https://www.johal.in/nanoid-python-custom-alphabet-size-tuning-for-unique-string-ids-2026/) — alphabet サイズと衝突確率の関係
- [MDN: Navigator.share()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) — Web Share API 公式仕様
- [LogRocket: Advanced guide to Web Share API](https://blog.logrocket.com/advanced-guide-web-share-api-navigator-share/) — 実装パターンとブラウザ対応
- [Piccalilli: Simplify sharing with built-in APIs](https://piccalil.li/blog/simplify-sharing-with-built-in-apis-and-progressive-enhancement/) — progressive enhancement 戦略
