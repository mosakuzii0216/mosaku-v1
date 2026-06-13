# Research & Design Decisions: password-reset-email

---

**Purpose**: パスワードリセットメール本実装の設計（design.md）を支える discovery 記録と意思決定の根拠。

---

## Summary

- **Feature**: `password-reset-email`
- **Discovery Scope**: Extension（既存 NestJS 認証システムへの統合。グリーンフィールドではない）
- **Key Findings**:
  - **トークンは sha256（決定的ハッシュ）で保存**するのが必須。bcrypt はソルトが毎回異なり `where: { resetPasswordToken }` で DB 検索できないため、確定エンドポイントで user を引けない。パスワードは bcrypt 維持・トークンは sha256 と方式を分離する。
  - **Resend Node SDK は例外を throw せず `{ data, error }` を返す**。`error` が non-null のとき送信失敗。MailService 側で `error` を判定し Sentry へ（`feature_area: 'auth'`）。これにより R2.4/R2.5（送信失敗でも曖昧レスポンス維持）が自然に実現する。
  - **再利用可能アセットが豊富**。`resetPasswordToken`/`resetPasswordExpires` カラム・`ResetPasswordDto`・`hashPassword`/`comparePassword`・`IsStrongPassword`・`revokeAllForUser`・機能フラグ `FEATURE_PASSWORD_RESET_EMAIL`・OAuth 未設定警告パターン・`@Throttle` がすべて既存。新規はメール基盤・確定ロジック・フロント確定画面に限定される。
  - gap-analysis にてフロント確定画面のスコープを **本 spec に含める**ことをユーザー確認済み（`PasswordResetConfirm.tsx` + `/auth/reset-password/confirm`）。

## Research Log

### Resend Node SDK のエラーハンドリングと NestJS 連携

- **Context**: R2（送信）・R2.4/R2.5（失敗時も曖昧レスポンス維持）を満たすため、Resend SDK の失敗表現を確認する必要があった。
- **Sources Consulted**:
  - [Send emails with Node.js — Resend](https://resend.com/docs/send-with-nodejs)
  - [Does NestJS Work With Resend? — StackCompat](https://www.stackcompat.dev/nestjs-with-resend/)
  - [resend-node issue #275](https://github.com/resend/resend-node/issues/275)
- **Findings**:
  - `resend.emails.send({...})` は `{ data, error }` を返し、**送信失敗でも reject せず `error` オブジェクトを返す**設計（ネットワーク層例外は別途 throw されうる）。
  - NestJS では薄い service で SDK をラップし DI する構成が定石（専用 `nestjs-resend` ラッパも存在するが、依存最小化のため本 spec では公式 `resend` を直接ラップする）。
- **Implications**:
  - MailService は「`error` 判定」と「例外 catch」の両方を内部で握りつぶし、**呼び出し側へは bool/void を返す**契約にする。これにより PasswordResetService の要求フローは送信結果に依存せず常に同一の曖昧レスポンスを返せる（R2.5）。
  - Cloud Run からの外部 HTTPS egress（api.resend.com）は許可されている前提。本番は **mosaku.jp ドメイン認証（SPF/DKIM の DNS レコード追加）**が送信元利用の前提作業。

### トークンのハッシュ方式（sha256 vs bcrypt）

- **Context**: R1.2「ハッシュ化して保存」・R4.1「受領トークンをハッシュ化し保存済みと照合」。
- **Findings**:
  - bcrypt は意図的にソルトをランダム化するため、平文トークンから保存値を再計算できず `findUnique`/`findFirst` で引けない。リセットトークンは「DB 検索キー」として使うため**決定的ハッシュ（sha256）**が業界標準。
  - トークン自体が 32 バイト（256bit）の暗号論的乱数なら、sha256 の前段に salt は不要（総当たり不能なエントロピー）。
- **Implications**: `token = crypto.randomBytes(32).toString('hex')`（平文 64 桁、メール URL に載せる）、保存は `sha256(token)`。確定時は `sha256(受領token)` で `findFirst({ where: { resetPasswordToken } })`。

### ユーザー列挙・タイミング攻撃の緩和

- **Context**: R3（列挙防御）。既存スタブは存在しないメールでも同一メッセージを返すが、分岐により処理時間差が出る。
- **Findings**: 厳密なタイミング均一化（存在しないユーザーでもダミー sha256/送信処理時間を消費）は実装可能だが、本機能は throttle で試行回数を制限しており、タイミング差からの列挙は低リスク。
- **Implications**: 第一目標は「レスポンス本文・ステータス・構造の同一化」（R3.1〜3.3）。タイミング均一化は follow-up（過剰設計を避けつつ、確定送信判定を early-return で漏らさない）。

## Architecture Pattern Evaluation

| Option                                  | Description                                                                   | Strengths                                                                       | Risks / Limitations                                  | Notes                       |
| --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| A: 既存 controller を拡張               | `resetPassword` 本実装＋確定ハンドラを同 controller に追加                    | ファイル増最小・throttle/Public 慣例を最短踏襲                                  | controller 肥大・発行/検証ロジックが混ざりテスト困難 | gap-analysis Option A       |
| B: `PasswordResetService`＋`MailModule` | 発行・送信・検証・ライフサイクルを専用 service に集約、メールは独立 module    | SRP・単体テスト容易（列挙一貫性/単回性を service で担保）・MailService 再利用可 | 新規ファイル・DI 配線増                              | gap-analysis Option B       |
| **C: ハイブリッド（採用）**             | **バックエンド=B、フロント=確定画面を本 spec に含め機能フラグ配下で段階導入** | テスト可能な単位に閉じ込めつつ E2E 動作を即達成                                 | フロントスコープの明示合意が必要（→確認済み）        | gap-analysis 推奨・**採用** |

## Design Decisions

### Decision: トークンは sha256 決定的ハッシュ、パスワードは bcrypt

- **Context**: R1.2 / R4.1。検索キーとして使うトークンと、照合のみのパスワードで要件が異なる。
- **Alternatives Considered**:
  1. 両方 bcrypt — トークンを DB 検索できず確定不能。✗
  2. トークン平文保存 — DB 漏洩時に即時悪用。要件 R1.2 違反。✗
- **Selected Approach**: 平文トークン=`randomBytes(32).hex`（メール URL）、保存=`sha256(token)`。パスワードは既存 `hashPassword`（bcrypt rounds=12）維持。
- **Rationale**: 検索可能性とハッシュ保存を両立。高エントロピー乱数のため salt 不要。
- **Trade-offs**: sha256 は高速で総当たりに弱いが、256bit 乱数では実質不能。
- **Follow-up**: 確定時の比較は文字列一致（タイミングセーフ比較は token がランダムキーのため必須ではない）。

### Decision: メール基盤は独立 `MailModule`（Resend ラッパ）

- **Context**: R2 / R6.1 / R6.4。送信責務を auth から分離し将来の通知系で再利用。
- **Selected Approach**: `MailModule` に `MailService`（公式 `resend` SDK ラッパ）。`RESEND_API_KEY` 未設定時は OAuth strategy 同様に `isConfigured=false` ＋ `logger.warn` で起動継続。`sendPasswordResetEmail()` は失敗を内部で握り潰し `void`/bool を返す。
- **Rationale**: R6.4 の「未設定でも起動継続」と R2.5 の「送信失敗がレスポンスを変えない」を構造的に保証。
- **Trade-offs**: 新規 module の DI 配線コスト < 単体テスト容易性のメリット。
- **Follow-up**: 本番ドメイン認証（DKIM/SPF）完了まで `MAIL_FROM` は `onboarding@resend.dev` を暫定使用可。

### Decision: 確定エンドポイントを `POST /auth/reset-password/confirm` として新設

- **Context**: 既存 `/auth/reset-password` は要求（email→送信）。確定（token+newPassword）は別アクション。フロント `/auth/reset-password` ルートは既に「ログイン中パスワード変更 UI」が占有。
- **Selected Approach**: バックエンド `POST /auth/reset-password/confirm`（`@Public()`＋`@Throttle`、`ResetPasswordDto` 流用）。フロント新ルート `/auth/reset-password/confirm`（`PasswordResetConfirm.tsx`、`?token=` を `useSearchParams` で読む）。
- **Rationale**: 既存 UI とのパス衝突回避。リセット URL ベース=`${FRONTEND_URL}/auth/reset-password/confirm`。
- **Trade-offs**: ルート 1 本追加のみ。既存 `PasswordReset.tsx`（変更 UI）には触れない。

### Decision: エラーコードは AUTH003 流用＋ AUTH014 新設

- **Context**: R4.2（無効トークン）/ R4.3（期限切れ）。
- **Selected Approach**: 無効・使用済みトークン=`AUTH003 INVALID_TOKEN` 流用、期限切れ=`AUTH014 RESET_TOKEN_EXPIRED` 新設。強度違反=既存 `class-validator`（VAL 系）。
- **Rationale**: トークンベースのため列挙ベクトルにならず、UX 上は期限切れと無効を区別した方が親切。
- **Follow-up**: `RevokeAllReason` に `'password_reset'` を追加（R5.5）。

## Risks & Mitigations

- **本番メール到達性（DKIM/SPF 未設定）** — mosaku.jp の DNS レコード追加を実装前提作業として tasks に明記。暫定は `resend.dev` 送信元。
- **機能フラグ OFF 時に UI が「送信成功」表示でも実際は未送信** — dev では AppLogger にリセット URL を出力し手動検証可能にする。本番は flag ON 運用。
- **列挙のタイミング差** — throttle 併用で低リスク。第一は本文/構造の同一化。均一化は follow-up。
- **Resend 無料枠（日次/月次上限）超過** — 失敗を Sentry 記録、曖昧レスポンス維持で UX 劣化を限定。上限監視は運用課題。

## References

- [Send emails with Node.js — Resend](https://resend.com/docs/send-with-nodejs) — SDK の `{ data, error }` 契約
- [Does NestJS Work With Resend? — StackCompat](https://www.stackcompat.dev/nestjs-with-resend/) — service ラッパ構成
- [resend-node issue #275](https://github.com/resend/resend-node/issues/275) — エラー応答の挙動
- gap-analysis.md — 既存アセット棚卸しとスコープ確定
