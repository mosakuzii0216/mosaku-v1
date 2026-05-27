# Research & Design Decisions — memo-public-sharing

---

## Summary

- **Feature**: `memo-public-sharing`
- **Discovery Scope**: Extension (既存 `memo` ドメインに公開メタデータと閲覧 API を追加する Unlisted URL 機能)
- **Key Findings**:
  - Mosaku の既存基盤（グローバル JWT Guard + `@Public()` opt-out、`AuthorizationService`、`@nestjs/throttler`、Sentry `feature_area: 'memo'`、React Query `queryKeys.memos.*`、`apiClient.requestPublic`）が要件をほぼ素直に充足する。新規追加点は (1) Prisma スキーマ拡張 (`publicToken`/`publishedAt`)、(2) `MemoSharingService` + `PublicMemoController`、(3) フロント `/p/:token` ルートと閲覧専用ビュー、(4) 設定ページの公開メモ一覧。
  - **TipTap StarterKit の `editable: false` 再利用が最適**: 既に `RichTextEditor` が StarterKit ベースであり、`useEditor({ editable: false })` で読取り専用化できる（`@tiptap/react` 公式 API）。DOMPurify を新規導入するより依存・スタイル整合性の観点で優位。公開ビューでは `Mention` 拡張を外して suggestion を抑制する。
  - **レート制限は `app.set('trust proxy', 1)` の追加が前提**: `@nestjs/throttler` のデフォルト tracker は `req.ip` を見るが、Cloud Run 経由では `X-Forwarded-For` を信頼する設定がないと全リクエストが同一 IP（プロキシ）に集約され IP 単位の制御が機能しない。`main.ts` で trust proxy を有効化する。
  - **Cache-Control は `private, max-age=30, must-revalidate`** を採用。Cloudflare / Vercel Edge のレイヤで公開メモ本文をキャッシュさせず、ブラウザのみ短時間キャッシュ。非公開化直後（最大 30 秒）の閲覧切断保証は SLA 要件で許容される。
  - **トークン**: `crypto.randomBytes(32).toString('base64url')` → 256bit、URL セーフ 43 文字。`P2002` 捕捉で最大 5 回リトライ（衝突率は実質ゼロだが防御的に）。

## Research Log

### Topic: 公開メモ本文のレンダリング方式

- **Context**: Req 3.2 / 4.3 — 閲覧専用ビューで TipTap が生成した HTML を XSS 安全に表示する必要がある。`RichTextEditor` は所有者向けの編集 UI を含むため、そのままは使えない。
- **Sources Consulted**:
  - TipTap 公式: `useEditor({ editable: false })` で読取り専用 Editor をマウントできる（[tiptap docs / Editor instance](https://tiptap.dev/docs/editor/api/editor)）
  - `frontend/src/components/editor/RichTextEditor.tsx` — StarterKit + Placeholder + Mention を `useEditor` でセットアップ
  - 既存 CSP: `defaultSrc 'self'`、`imgSrc 'self' data: https:`、`scriptSrc 'self'` — TipTap が生成する HTML は通常 `<p>` / `<h1>` / `<ul>` 等の安全タグのみで CSP 配下で問題なし
- **Findings**:
  - 案A (採用): TipTap `editable: false` で読み取り専用 Editor を再利用 → スタイル一貫性、依存追加ゼロ、StarterKit が想定外タグを生成しない（input サニタイズはエディタ側で完了済み）
  - 案B: `dangerouslySetInnerHTML` + DOMPurify → 新規依存 (`isomorphic-dompurify` ~30KB gzip)、別途サニタイズ規約管理が必要
  - 案C: 自前 HTML サニタイザ → メンテナンスコスト高
- **Implications**: 公開ビュー用に **`PublicMemoRenderer`** コンポーネントを別途実装（`RichTextEditor` から toolbar・Mention・onChange を除外し、`editable: false` でマウント）。これにより `RichTextEditor` 本体には触らず、SRP を維持。

### Topic: Cloud Run 上での IP レート制限

- **Context**: Req 3.6 — 未ログイン IP 単位のレート制限。Cloud Run 経由では `X-Forwarded-For` 経由でクライアント IP が伝搬する。
- **Sources Consulted**:
  - `@nestjs/throttler` v6+ デフォルト `getTracker()` は `req.ips[0] || req.ip` を見る
  - Express `trust proxy` 設定: `app.set('trust proxy', N)` で N 段のプロキシまで `X-Forwarded-For` を信頼
  - Google Cloud Run: クライアントとの間に GCLB が 1 段入る
  - `backend/src/main.ts` (現状): trust proxy 未設定
- **Findings**:
  - 現状のままだと `req.ip` が GCLB の内部 IP に固定され、全クライアントが同一 tracker に集約される（rate limit 機能不全 / 共有負荷で正当アクセスが弾かれる二重リスク）
  - `app.set('trust proxy', 1)` で `X-Forwarded-For` の最後尾を信頼する（Cloud Run + 単一 GCLB 構成の標準パターン）
  - 公開閲覧の制限値: `@Throttle({ default: { ttl: 60_000, limit: 60 } })` をハンドラに付与。デフォルト（30/60s）より緩い 60/60s を採用（共有 URL 経由の正当な複数クライアントを許容）。env 経由で調整可能にする
- **Implications**: `main.ts` に `app.set('trust proxy', 1)` を追加、`PublicMemoController.findByToken` に `@Throttle` を付与、`THROTTLE_CONFIG` (`config/auth-constants.ts`) に `PUBLIC_MEMO_VIEW` を追加。

### Topic: 公開閲覧レスポンスの Cache-Control

- **Context**: Req 6.3 — 非公開化直後の閲覧者がキャッシュにヒットして読み続ける問題を防ぎつつ、所有者のメモが繰り返し叩かれて DB 負荷が上がるリスクを軽減する。
- **Sources Consulted**:
  - Cloud Run のレスポンスキャッシュ仕様: アプリ側で `Cache-Control` を指定しない限り中間キャッシュは無効
  - Vercel/Cloudflare 配下: `Cache-Control: public` を付けると Edge にキャッシュされ得る
  - NestJS `@Header('Cache-Control', '...')` デコレータでレスポンスヘッダー付与が可能
- **Findings**:
  - 採用: `Cache-Control: private, max-age=30, must-revalidate` + `Vary: Accept`
  - `private` により CDN/Edge にキャッシュさせない（非公開化直後のリスクをブラウザ単独に限定）
  - `max-age=30` でブラウザは 30 秒間再利用 → 同一ユーザーの連続アクセスを抑制
  - `must-revalidate` で期限切れ後は必ず再検証
- **Implications**: `PublicMemoController.findByToken` に `@Header('Cache-Control', 'private, max-age=30, must-revalidate')` を付与。React Query 側は `staleTime: 30_000`、`gcTime: 60_000` で揃え、所有者操作後の `invalidateQueries` で即時反映。

### Topic: トークン生成と衝突回避

- **Context**: Req 2.1 / 2.3 / 2.5 — 128bit 以上のエントロピー、URL セーフ、ユニーク制約。
- **Sources Consulted**:
  - Node.js `crypto.randomBytes(32).toString('base64url')` → 256bit、43 文字、URL セーフ（RFC 4648）
  - 既存 `backend/src/invitation/code-generator.ts` が招待コードで類似パターン（P2002 リトライ）を実装
  - Prisma `@unique` 制約と `P2002` エラーコード
- **Findings**:
  - 採用: `randomBytes(32).toString('base64url')` で 256bit 確保（要件 128bit を大幅に上回る）
  - 衝突確率: 256bit 空間 × 数千〜数万メモなら生涯衝突 0 が現実。ただし防御的に `P2002` 捕捉で最大 5 回リトライ
  - スキーマ: `publicToken String? @unique @map("public_token") @db.VarChar(64)`（base64url 43 文字 + 余裕）
- **Implications**: `MemoSharingService.generateUniqueToken()` を private helper として実装。`PublishMemoResponseDto.publicToken` で所有者に返却、`PublicMemoResponseDto` には含めない（受信者は URL から token を知る）。

### Topic: ゴミ箱連動（自動非公開）

- **Context**: Req 1.5 / 1.6 — ゴミ箱内メモは公開不可、公開中→ゴミ箱で自動非公開化。
- **Sources Consulted**:
  - `backend/src/memo/memo.service.ts:277` `MemoService.trash()` の現行実装
  - `BaseOwnableService` の所有権検証経路
- **Findings**:
  - 採用: `MemoService.trash()` 内で `await this.memoSharingService.unpublishIfPublished(id, userId)` を **trash() の前** に呼ぶ（既に publicToken が NULL なら no-op）
  - `MemoService.findOne(id, userId)` は `trashedAt: null` フィルタを持つため、`publish` 系メソッドが `findOne` を経由する限り Req 1.5 は自動充足
  - Prisma middleware を使わない理由: 暗黙的でデバッグ困難、本プロジェクトの「明示的なサービス層 orchestration」方針と非整合
- **Implications**: `MemoService` → `MemoSharingService` への循環参照を避けるため、`MemoSharingService` を `MemoService` の constructor に DI する（一方向）。trash → unpublish の順序を保証するテストを追加。

### Topic: 公開メモビューの SEO / OGP

- **Context**: gap-analysis §6 で「OGP 対応の判断」が research needed として残っていた。
- **Sources Consulted**:
  - Vite SPA は SSR なし、`<title>` / `<meta>` は `react-helmet-async` 等を導入しないと動的更新できない
  - 既存 `index.html` の静的メタタグのみ
- **Findings**:
  - MVP では **対応しない**（要件外）。`/p/:token` の `<title>` をクライアント側で動的に更新する程度に留める（`document.title = memo.title`）。
  - OGP（`og:title`, `og:description` 等）は Phase 1 では Slack/Discord で URL カードが生成されないが、要件範囲外で許容
- **Implications**: 将来 OGP 対応するなら Vercel Edge Functions で `/p/:token` を SSR してメタタグを動的生成する案がある（将来拡張）。

### Topic: ノートブック名・テーマの公開可否

- **Context**: gap-analysis §6.4 — 閲覧者にノートブック名やテーマを公開するか。要件は `title/content/updatedAt` のみ明示。
- **Findings**:
  - MVP では **タイトル・本文・最終更新日時のみ**（Req 3.2 で「個人情報を含めない最小レスポンス」と規定）
  - ノートブック名は所有者の整理構造の漏出になり得るため非公開
  - テーマは「閲覧者は Mosaku のデフォルトテーマで表示」とする（所有者の選択テーマを閲覧側に強制しない）
- **Implications**: `PublicMemoResponseDto = { title, content, updatedAt }` のみ。

## Architecture Pattern Evaluation

| Option                                                | Description                                                                                               | Strengths                                                                                                                   | Risks / Limitations                                                                                | Notes                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A. Memo 列拡張 + memo モジュール内サービス分離 (採用) | `Memo.publicToken/publishedAt` + `MemoSharingService` + `PublicMemoController` を memo モジュール内に配置 | マイグレーション 1 本、JOIN 不要、SRP を保ちつつ最小実装、既存 `AuthorizationService` / `BaseOwnableService` パターンに整合 | Memo モデルが将来肥大化する可能性（visit count, 期限付き共有を追加したくなった時）                 | 拡張時には Option B (MemoShare 1:1 分離) へリファクタする道筋を残せる |
| B. MemoShare テーブル 1:1 分離                        | 公開メタデータを別テーブルに切り出し                                                                      | 関心分離が明確、将来の拡張に強い                                                                                            | 1:1 関係には過剰、JOIN コスト、現在の要件では over-engineering                                     | 将来要件が顕在化したら採用                                            |
| C. MemoSharing 別モジュール化                         | `MemoSharingModule` を作って memo から独立                                                                | 完全分離                                                                                                                    | Memo Prisma 依存のクロスモジュール参照が冗長、steering の「1 ドメイン = 1 モジュール」方針と非整合 | 不採用                                                                |

## Design Decisions

### Decision: データモデル — Option A（Memo 列拡張）

- **Context**: 公開メタデータ（token・公開日時）の保存先。要件 2.5「ユニーク制約」を満たす必要がある。
- **Alternatives Considered**:
  1. A. Memo に `publicToken` / `publishedAt` 列追加
  2. B. `MemoShare` テーブル 1:1 分離
  3. C. `MemoShare` 多対1（履歴あり）— Req 2.1「1 本だけ保持」に違反するため除外
- **Selected Approach**: Option A。`publicToken String? @unique @map("public_token") @db.VarChar(64)` + `publishedAt DateTime? @map("published_at")` を Memo モデルに追加。
- **Rationale**: マイグレーション 1 本で完結、`findOne` の include を変更不要、既存パターンに最も近い。NULL は「非公開」、NOT NULL は「公開中」というシンプルなセマンティクス。
- **Trade-offs**:
  - ✅ 最小実装、ユニーク制約をスキーマレベルで保証、JOIN なし
  - ❌ Memo モデルに公開系メタデータが混在（将来肥大化リスク）
- **Follow-up**: visit count / 期限付き共有 / メールアドレス指定が次フェーズで議論された時点で `MemoShare` 分離リファクタを検討。

### Decision: サービス・コントローラ構成 — memo モジュール内分離

- **Context**: 公開系ロジックを既存 `MemoService` (340 行) に直接追加すると SRP 違反かつテストが肥大化する。
- **Alternatives Considered**:
  1. A. `MemoService` に publish/unpublish/regenerate を追加
  2. B. `MemoSharingModule` を別モジュール化
  3. C (採用). memo モジュール内に `MemoSharingService` + `PublicMemoController` を分離
- **Selected Approach**: `memo/memo-sharing.service.ts` と `memo/public-memo.controller.ts` を新規。所有者向けエンドポイント（publish/unpublish/regenerate/listMine）は既存 `MemoController` に追加。
- **Rationale**: ドメイン境界（memo）を保ちつつサービス層の SRP を確保。`PublicMemoController` を独立させることで `@Public()` 適用範囲が明示的。
- **Trade-offs**: ファイル 2 本増、サービス間 DI が 1 本増（許容範囲）
- **Follow-up**: `MemoSharingService` の責務が想定外に膨れたら、テストと共に別モジュール化を検討。

### Decision: 公開閲覧ビュー — TipTap editable:false 再利用

- **Context**: Req 3.2 / 4.3。`RichTextEditor` は所有者編集 UI が混在しているため直接 reuse できない。
- **Alternatives Considered**:
  1. A. `RichTextEditor` を編集可否で分岐
  2. B. 別コンポーネント `PublicMemoRenderer`（TipTap editable:false）
  3. C. DOMPurify + `dangerouslySetInnerHTML`
- **Selected Approach**: B。`PublicMemoRenderer` を新規実装。StarterKit のみ、`editable: false`、`onChange` なし、Mention 拡張なし、toolbar なし。
- **Rationale**: 既存 `RichTextEditor` の責務を汚さず、スタイル整合性を維持し、依存追加ゼロ。TipTap が生成する HTML はエディタ内でサニタイズ済みのため XSS リスクが低い。
- **Trade-offs**:
  - ✅ 依存追加なし、スタイル一貫
  - ❌ TipTap 本体（~50KB gzip）が公開閲覧バンドルに含まれる（既に他ページで使用済みなので追加コストはほぼゼロ）
- **Follow-up**: Lighthouse スコア計測。公開ビュー専用に StarterKit を絞り込めるか確認。

### Decision: バックエンド公開閲覧パス — `/memos/public/:token`

- **Context**: Sentry の `feature_area` 自動分類は URL prefix を見るため、フロント要件 `/p/:token` をそのままバックエンドに採用すると `feature_area: 'unknown'` に分類される（`common/sentry/sentry-tags.ts:24` のマップ）。
- **Alternatives Considered**:
  1. A. バックエンドも `/p/:token`
  2. B (採用). バックエンド `/memos/public/:token`、フロント `/p/:token`
  3. C. Sentry tag マップに `/p` を追加して memo にマップ
- **Selected Approach**: B。フロント `/p/:token` → 内部で `apiClient.getPublicMemo(token)` → `GET /memos/public/:token`。
- **Rationale**: Sentry の `feature_area` 規約を変更不要、`/memos` プレフィックスで自動的に `memo` に分類される。フロントの公開 URL は短く保つ（共有体験を損なわない）。
- **Trade-offs**: フロントとバックでパスが異なるが、apiClient で吸収するためユーザーには見えない。

### Decision: レート制限 — Throttle decorator + trust proxy

- **Context**: Req 3.6 — IP 単位のレート制限。Cloud Run 配下では `req.ip` が信頼できない。
- **Alternatives Considered**:
  1. A. `@Throttle` + `app.set('trust proxy', 1)`（採用）
  2. B. カスタム tracker（`getTracker` を override して `X-Forwarded-For` を直接見る）
  3. C. Cloudflare Rate Limiting Rule で前段制御
- **Selected Approach**: A。`PublicMemoController.findByToken` に `@Throttle({ default: { ttl: 60_000, limit: 60 } })`。`main.ts` に `app.set('trust proxy', 1)`。
- **Rationale**: Express + `@nestjs/throttler` の標準構成、既存 `auth.controller.ts` の `@Throttle` パターンと一貫、env で調整可能。
- **Trade-offs**: Cloud Run の前段 GCLB が 1 段である前提（事実）。
- **Follow-up**: 本番投入後 1 週間で `429 Too Many Requests` の発生率を Sentry で確認、limit を調整。

### Decision: Cache-Control — `private, max-age=30, must-revalidate`

- **Context**: Req 6.3 — 非公開化直後の閲覧切断と DB 負荷低減のトレードオフ。
- **Alternatives Considered**:
  1. A. `no-store`（キャッシュ完全無効） — 所有者の負荷増
  2. B (採用). `private, max-age=30, must-revalidate`
  3. C. `public, max-age=300` — CDN にキャッシュされ非公開化直後の漏洩リスク
- **Selected Approach**: B。`@Header('Cache-Control', 'private, max-age=30, must-revalidate')`。
- **Rationale**: ブラウザのみ短時間（30 秒）キャッシュ。Edge/CDN にキャッシュさせない（`private`）。非公開化直後のリスクを 30 秒に限定。
- **Trade-offs**: 非公開化直後の最大 30 秒間は既に開いているブラウザでメモが残る可能性。要件 6.3「スタンプリングの長いキャッシュにヒットして読み続けないように」を満たす（30 秒は許容範囲）。

### Decision: 観測性 — Sentry captureMessage で 3 イベント

- **Context**: Req 6.1。公開化・非公開化・トークン再生成の監査ログ。
- **Selected Approach**:
  - `memo_public_published` / `memo_public_unpublished` / `memo_public_token_regenerated` を `Sentry.captureMessage(name, { level: 'info', tags: { feature_area: 'memo', user_facing: false } })` で送信
  - 例外は既存 `SentryGlobalFilter` + `applyStandardTags` に任せる（5xx に `user_facing: true` 自動付与）
- **Rationale**: 既存 `auth/refresh-token.service.ts:78` の captureMessage パターンと同型。Sentry の breadcrumb / search で監査トレースが可能。

## Risks & Mitigations

- **R1: 公開メモの HTML サニタイズ不備による XSS**
  - 緩和: TipTap StarterKit のスキーマ制限内のタグ・属性のみ許容（編集時にエディタが排除）。既存 CSP（`scriptSrc 'self'`）でインラインスクリプト実行を二重ブロック。
- **R2: トークン総当たり攻撃**
  - 緩和: 256bit エントロピー（実質総当たり不可）+ IP レート制限（60 req/分）+ 失敗時 404（存在判定不可能）。
- **R3: Cloud Run 上での IP 偽装（X-Forwarded-For 操作）**
  - 緩和: `trust proxy: 1` で GCLB が付与する最後尾の X-Forwarded-For のみ信頼。GCLB はクライアント原 IP を最後尾に追記するため、悪意ある原リクエストの X-Forwarded-For ヘッダは上書きされない。
- **R4: 非公開化直後のブラウザキャッシュヒット**
  - 緩和: Cache-Control max-age=30。最悪 30 秒の遅延。SLA として明文化（Req 6.3 の許容範囲内）。
- **R5: ゴミ箱遷移と公開状態の整合性破綻**
  - 緩和: `MemoService.trash()` 内で `unpublishIfPublished()` を呼ぶ。トランザクション不要（Prisma update 2 本を順次実行で OK、失敗時は両方ロールバックさせず手動でリトライ可能なログを残す）。テストで明示的に検証。
- **R6: 公開メモが多数あるユーザーの一覧パフォーマンス**
  - 緩和: MVP では全件返却（要件 5.1 に明示）。`(userId, publishedAt)` の compound index を追加して O(log n) クエリにする。1 ユーザーが 1 万件公開する想定はないが、将来ページネーション化を検討。

## References

- [TipTap Editor API — editable option](https://tiptap.dev/docs/editor/api/editor#editable) — 読取り専用化の正規 API
- [@nestjs/throttler — Trust Proxy](https://docs.nestjs.com/security/rate-limiting#proxies) — Cloud Run 上での tracker 設定
- [Express trust proxy](https://expressjs.com/en/guide/behind-proxies.html) — GCLB 1 段構成の標準設定
- [MDN — Cache-Control: private](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#private) — Edge/CDN にキャッシュさせない指定
- [RFC 4648 base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5) — URL セーフトークンエンコーディング
- 内部: `.kiro/specs/memo-public-sharing/gap-analysis.md` — 既存資産マッピング
- 内部: `.kiro/steering/tech.md` — Sentry 構造化タグ契約 / `feature_area` enum
