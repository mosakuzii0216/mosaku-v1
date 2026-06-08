# Requirements Document

## Introduction

フィードバックDB永続化機能は、既存の Slack 通知フロー（`FeedbackService`）に加えて、ユーザーが送信したフィードバックを PostgreSQL（Supabase）へ保存する機能である。現在は Slack Webhook へのみ送信されるため、過去のフィードバックを検索・集計する手段がない。本機能により、将来の管理画面・傾向分析・スパム検出の基盤を整備する。

**既存実装の前提**:

- `POST /feedback` エンドポイントは JWT Guard で保護済み（認証済みユーザーのみ）
- `CreateFeedbackDto` は `category`（bug / improvement / other）と `message`（最大1000文字）を持つ
- `FeedbackService.submit()` は Slack Webhook へ通知し、`void` を返す
- Prisma スキーマに `Feedback` テーブルは未定義

## Requirements

### Requirement 1: Feedback テーブルのスキーマ定義

**Objective:** As a 開発者, I want Feedback テーブルを Prisma スキーマで定義すること, so that フィードバックデータを DB に永続化できる基盤が整う

#### Acceptance Criteria

1. The Feedback API shall persist records with fields: `id`（UUID）、`userId`（User への外部キー）、`category`（FeedbackCategory enum）、`message`（文字列）、`createdAt`（タイムスタンプ）
2. The Feedback API shall define `userId` as a required foreign key referencing the `User` model
3. The Feedback API shall use `@map("feedbacks")` または `@@map("feedbacks")` でテーブル名を `feedbacks` にマッピングすること
4. If User が削除された場合, the Feedback API shall カスケード削除（`onDelete: Cascade`）によって関連フィードバックを自動削除すること
5. The Feedback API shall `createdAt` に `@default(now())` を設定してサーバー側でタイムスタンプを自動付与すること

---

### Requirement 2: フィードバック提出時の DB 保存

**Objective:** As a ユーザー, I want フィードバックを送信したとき DB に記録されること, so that 管理者が過去のフィードバックを参照・分析できる

#### Acceptance Criteria

1. When ユーザーが `POST /feedback` を呼び出した場合, the Feedback API shall フィードバックを `feedbacks` テーブルへ保存すること
2. The Feedback API shall DB 保存レコードに `userId`（JWT から取得）、`category`、`message` を含めること
3. When リクエストがバリデーション・認証・レート制限を通過した場合, the Feedback API shall（Slack 通知・DB 保存の成否に関わらず）`201 Created` を返すこと
4. The Feedback API shall 既存の Slack 通知と DB 保存を並列実行（`Promise.allSettled` 相当：各 Promise を catch ラップして `Promise.all` で待ち合わせ）し、いずれかが失敗してもレスポンスを返すこと

---

### Requirement 3: Slack 通知（必須）と DB 保存（補助）の独立性

**Objective:** As a 運用者, I want Slack 通知の失敗を確実に検知でき、かつ DB 保存が失敗してもユーザーの送信が失敗扱いにならないこと, so that フィードバックに日々気づいて対応でき、補助的なアーカイブ障害でユーザー体験を損なわない

> **優先度方針**: Slack 通知を**必須レッグ**（フィードバックに気づく主経路）、DB 保存を**補助レッグ**（検索・集計用アーカイブ）とする。どちらの副作用失敗でも HTTP 500 は返さず、監視の重みのみ変える。

#### Acceptance Criteria

1. If DB 保存が失敗した場合, the Feedback API shall Slack 通知を継続し、エラーを `logger.warn` で記録して `201 Created` を返すこと
2. If Slack Webhook 送信が失敗した場合, the Feedback API shall DB 保存を継続し、エラーを `Sentry.captureException`（`feature_area: 'system'`）で記録して `201 Created` を返すこと
3. The Feedback API shall Slack 失敗を `Sentry.captureException`（`feature_area: 'system'`）で記録し、DB 失敗を `logger.warn` で記録すること
4. While Slack Webhook URL が未設定の場合, the Feedback API shall Slack 通知をスキップして DB 保存のみ実行し、これを Slack 失敗扱い（Sentry 送信）にしないこと
5. The Feedback API shall Slack 通知・DB 保存いずれの副作用失敗でも `500 Internal Server Error` を返さないこと

---

### Requirement 4: データ整合性とバリデーション

**Objective:** As a 開発者, I want フィードバックデータが常に有効な値で保存されること, so that 後の分析・集計で不正データに起因する問題が起きない

#### Acceptance Criteria

1. The Feedback API shall `message` が空文字または 1000 文字超の場合に `400 Bad Request` を返し、DB 保存しないこと
2. The Feedback API shall `category` が `bug / improvement / other` 以外の場合に `400 Bad Request` を返し、DB 保存しないこと
3. The Feedback API shall 認証されていないリクエストに対して `401 Unauthorized` を返し、DB 保存しないこと
4. The Feedback API shall レート制限（1分間に3件まで）を超えた場合に `429 Too Many Requests` を返し、DB 保存しないこと

---

### Requirement 5: テスト可能性

**Objective:** As a 開発者, I want フィードバック保存ロジックをユニットテストで検証できること, so that リグレッションを CI で早期検出できる

#### Acceptance Criteria

1. The Feedback API shall `FeedbackService` が `PrismaService` を依存注入で受け取り、モック置換可能な設計であること
2. When Slack 成功かつ DB 保存成功の場合, the Feedback API shall `void` を返すこと
3. When DB 保存失敗かつ Slack 成功の場合, the Feedback API shall エラーをスローせず（`logger.warn` で記録して）`void` を返すこと
4. When Slack 失敗の場合, the Feedback API shall エラーをスローせず（`Sentry.captureException` で記録して）`void` を返すこと（コントローラーは `201` を返す）
