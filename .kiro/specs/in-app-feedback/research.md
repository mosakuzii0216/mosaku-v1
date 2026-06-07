# Research & Design Decisions — in-app-feedback

---

## Summary

- **Feature**: in-app-feedback
- **Discovery Scope**: Extension with External Service Integration
- **Key Findings**:
  1. DB 永続化不要 — フィードバックは Slack Webhook への fire-and-forget で完結し、Prisma スキーマ変更ゼロ
  2. グローバル JWT Guard + ThrottlerGuard は既設済み — `FeedbackController` はデコレータ追加のみで保護完了
  3. フロントエンドモーダル状態は Zustand（UI state）、送信は React Query mutation — 既存パターンに完全準拠

---

## Research Log

### Slack Incoming Webhooks API

- **Context**: Req 4.1〜4.5 の Slack 通知実装方針を確定するため調査
- **Sources Consulted**: Slack API 公式ドキュメント（Incoming Webhooks）
- **Findings**:
  - Webhook URL に POST するだけでメッセージ送信可能。認証ヘッダー不要（URL がシークレット）
  - ペイロード形式: `{ text: string }` または Block Kit の `{ blocks: [...] }`
  - Slack 側エラー: HTTP 200 以外（`invalid_payload`, `channel_not_found` 等）または接続タイムアウト
  - `axios` / `fetch` どちらでも実装可能。既存 NestJS サービスは Node.js `fetch`（Node 22）を利用可能
- **Implications**:
  - 専用 SDK（`@slack/webhook`）は依存追加になるため、Node.js 標準 `fetch` で実装する方針を選択
  - Slack 失敗は `Sentry.captureException` 後、クライアントへは `201` を返す（Req 4.4）

### 既存 ThrottlerGuard 設定の確認

- **Context**: Req 5.2 のレート制限適用方針確定
- **Sources Consulted**: `backend/src/app.module.ts`
- **Findings**:
  - グローバル設定: `{ ttl: 60000, limit: 30 }` — 60秒間に30リクエスト
  - `@Throttle({ default: { limit: N, ttl: T } })` で endpoint 単位に上書き可能
  - フィードバック送信は 1 分間 3 回程度が適切（スパム防止 + UX 支障なし）
- **Implications**:
  - `POST /feedback` に `@Throttle({ default: { limit: 3, ttl: 60000 } })` を付与して上書き

### フロントエンドモーダルパターンの調査

- **Context**: 既存 Modal コンポーネントがあるか確認
- **Sources Consulted**: `frontend/src/components/` ディレクトリ探索
- **Findings**:
  - 共通 Modal/Dialog コンポーネントは存在しない（`TagManager`, `TagForm` は inline で実装）
  - 既存の `TagManager` が「ボタン → 条件レンダー → フォーム」のパターンを採用
  - Zustand ストアは UI 状態（`isOpen`）専用、サーバーデータは React Query
- **Implications**:
  - `FeedbackModal` は自己完結型コンポーネントとして実装（backdrop + dialog 内包）
  - `useFeedbackStore` を新規作成して `isOpen` を管理

### Sentry `feature_area` タグの確認

- **Context**: tech.md の `feature_area` enum が固定契約となっているため確認
- **Sources Consulted**: `backend/src/` の Sentry 設定, tech.md
- **Findings**:
  - 現行 enum: `memo / notebook / tag / theme / auth / invitation / system / unknown`
  - `feedback` はこの enum に含まれない
- **Implications**:
  - Slack 失敗時の `captureException` に `feature_area: 'system'` を付与する
  - enum 拡張は別タスクで検討（今回スコープ外）

---

## Architecture Pattern Evaluation

| Option                     | Description                                       | Strengths               | Risks / Limitations                                     | Notes                                      |
| -------------------------- | ------------------------------------------------- | ----------------------- | ------------------------------------------------------- | ------------------------------------------ |
| DB 永続化あり              | Feedback を Prisma で保存し管理画面で閲覧         | 後からデータ参照可能    | スキーマ追加・マイグレーション必要、6月末に間に合わない | **不採用** — 6月末 MVP スコープ外          |
| Slack Webhook 直接（選択） | バックエンドから Slack Webhook に fire-and-forget | DB 変更ゼロ、実装が最小 | Slack 障害時に履歴消失                                  | **採用** — 要件と一致、Sentry でエラー補足 |
| メール通知                 | SendGrid 等でメール送信                           | 汎用性高い              | 新規 SDK 導入、環境変数追加が複数                       | 不採用 — Slack が既存インフラ              |

---

## Design Decisions

### Decision: DB 永続化なし / Slack Webhook のみ

- **Context**: 6月末友人・家族向け限定公開に向けた最小実装。フィードバック件数が少量のため DB は不要
- **Alternatives Considered**:
  1. Prisma `Feedback` テーブルを追加してスタンダードな CRUD を実装
  2. バックエンド経由で Slack Webhook のみに送信（DB なし）
- **Selected Approach**: Option 2
- **Rationale**: Prisma スキーマ変更ゼロ、マイグレーション不要。要件 4.4「Slack 障害時も送信成功を返す」により DB 代替は不要
- **Trade-offs**: フィードバック履歴はアプリ側に残らない（Slack チャンネルが唯一の記録）
- **Follow-up**: フィードバック件数が増えたら DB 永続化を検討（Phase 2 以降）

### Decision: Node.js fetch で Slack Webhook 呼び出し

- **Context**: 外部 HTTP クライアントの選択
- **Alternatives Considered**:
  1. `@slack/webhook` SDK（npm install 追加）
  2. Node.js 22 組み込み `fetch`（追加依存なし）
- **Selected Approach**: Node.js `fetch`
- **Rationale**: Node 22 では `fetch` がグローバルに利用可能。専用 SDK より軽量で依存追加が不要
- **Trade-offs**: Block Kit の高度な機能は使わない（Req 4.2〜4.3 を満たす範囲でテキスト+color attachment で実装）
- **Follow-up**: 実装後に Slack メッセージフォーマットをチームで確認

### Decision: フロントエンドモーダル状態管理は Zustand

- **Context**: モーダル開閉状態をどこで管理するか
- **Alternatives Considered**:
  1. `Header.tsx` のローカル `useState`（props drilling が発生）
  2. Zustand store `useFeedbackStore`（既存パターン）
- **Selected Approach**: Zustand store
- **Rationale**: Settings ページからも同じモーダルを開ける（Req 1.2）。ローカル state では Header と Settings が別インスタンスになる
- **Trade-offs**: 新しい Zustand ストアを1つ追加するが、`isOpen: boolean` のみで非常に薄い
- **Follow-up**: `FeedbackModal` のルートマウント場所（`App.tsx` 直下推奨）

---

## Risks & Mitigations

- **Slack Webhook URL が未設定の場合のサービス起動** — 環境変数が空のときは Slack 通知をスキップし警告ログを出す。`OAuthStrategy` の既存パターンに準拠
- **モーダルのアクセシビリティ（focus trap / ESC キー）** — 実装時に `<dialog>` 要素または手動 focus management を検討。MVP では最低限 ESC クローズを実装
- **1000文字バリデーションのフロント/バック乖離** — DTO の `@MaxLength(1000)` と FE の `maxLength` 定数を同じ値で定義し、型として `FEEDBACK_MESSAGE_MAX_LENGTH = 1000` を共有するか、各層で明示的に定義する

---

## References

- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks) — Webhook POST ペイロード仕様
- `backend/src/app.module.ts` — グローバル ThrottlerModule 設定
- `backend/src/common/decorators/public.decorator.ts` — JWT opt-out パターン
- `frontend/src/hooks/useTagQueries.ts` — React Query mutation パターン
- `frontend/src/stores/useViewStore.ts` — Zustand UI state パターン
