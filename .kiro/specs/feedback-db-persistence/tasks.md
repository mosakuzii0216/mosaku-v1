# Implementation Plan

## Task Format Template

- [x] 1. Prisma スキーマに Feedback モデルを追加する
- [x] 1.1 `feedbacks` テーブルのスキーマを定義する
  - `id`（cuid）、`userId`（User への外部キー）、`category`（FeedbackCategory enum）、`message`（文字列）、`createdAt`（`@default(now())`）を持つ `Feedback` モデルを追加する
  - `userId` フィールドは `@map("user_id")` を付け、`NOT NULL` の外部キーとして定義する
  - `@@map("feedbacks")` でテーブル名を `feedbacks` に固定する
  - User 削除時に関連フィードバックを自動削除する `onDelete: Cascade` をリレーション定義に追加する
  - `createdAt` に `@default(now())` を設定してサーバー側で自動付与する
  - `User` モデルに `feedbacks Feedback[]` のリレーション逆参照を追記する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 1.2 マイグレーションを生成・適用する
  - `npx prisma migrate dev` でマイグレーションファイルを生成する
  - マイグレーション適用後 `npx prisma generate` で Prisma クライアントを再生成する
  - マイグレーション成功と `feedbacks` テーブル・FK 制約の存在を `prisma migrate status` で確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. FeedbackModule に PrismaModule を組み込む
  - `FeedbackModule` の `imports` 配列に `PrismaModule` を追加する
  - `ConfigModule` はグローバル設定済みのため追加不要であることを確認する
  - この変更のみで `FeedbackService` への `PrismaService` DI が有効になることを確認する
  - _Requirements: 5.1_

- [x] 3. FeedbackService を並列副作用アーキテクチャに更新する
- [x] 3.1 Slack 通知ロジックを `sendToSlack()` プライベートメソッドに抽出する
  - 既存の Slack 送信コードを `sendToSlack(dto, context)` に切り出す
  - Slack URL 未設定時は `Promise.resolve()` を返す（Slack 失敗扱いにしない）
  - `sendToSlack()` 内部の `try/catch` と Sentry 送信を削除し、エラーを呼び出し元に伝播させる（`finally` の `clearTimeout` のみ残す）
  - `fetch` の応答が `!res.ok`（HTTP 4xx/5xx）の場合は `throw new Error(...)` して Slack 失敗を確実に検知できるようにする
  - _Requirements: 3.2, 3.3, 3.4_

- [x] 3.2 `PrismaService` を constructor injection で受け取る
  - `FeedbackService` のコンストラクタに `PrismaService` を追加する
  - Prisma 生成型と DTO 型は構造的に互換のためエイリアスインポート不要だった
  - _Requirements: 5.1_

- [x] 3.3 `submit()` を並列実行ロジックに置き換える
  - `submit()` のコンテキスト引数を `{ userId, name, email }` を含む形に変更する
  - Slack 通知と DB 保存をそれぞれ named outcome（`{ ok: true }` / `{ ok: false, error }`）にラップし `Promise.all` で待ち合わせる
  - Slack 失敗（`!slack.ok`）時は `Sentry.captureException(err, { tags: { feature_area: 'system' } })` を呼び throw しない
  - DB 失敗（`!db.ok`）時は `this.logger.warn('フィードバックの DB 保存に失敗しました', reason)` を呼び throw しない
  - いずれの失敗でも `submit()` は `void` で resolve し、コントローラーが 201 を返す動作を維持する
  - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. FeedbackController を更新して userId をコンテキストに追加する
  - `submit()` 呼び出しを `{ userId: req.user.id, name: req.user.name ?? '', email: req.user.email }` に変更する
  - `req.user.name` が `undefined` のとき `name: ''` にフォールバックする処理を追加する
  - _Requirements: 2.2, 2.3_

- [x] 5. FeedbackService のユニットテストを追加する
- [x] 5.1 (P) 正常系テストを追加する
  - Slack 成功・DB 成功の場合に `void` が返り例外が throw されないことを検証する
  - DB 成功時に `userId`・`category`・`message` が正しい値で `prisma.feedback.create` に渡されることを検証する
  - _Requirements: 5.2_

- [x] 5.2 (P) DB 失敗シナリオのテストを追加する
  - DB 失敗・Slack 成功の場合に `logger.warn` が呼ばれ、`Sentry.captureException` は呼ばれず、例外も throw されず `void` を返すことを検証する
  - DB 失敗が `Sentry.captureException` に昇格されないこと（named outcome の重み付けが入れ替わらないこと）を確認する（#1 回帰）
  - _Requirements: 3.1, 5.3_

- [x] 5.3 (P) Slack 失敗シナリオのテストを追加する
  - Slack 失敗（`slackOutcome` が `ok: false`）の場合に `Sentry.captureException` が `feature_area: 'system'` タグ付きで呼ばれ、例外は throw されず `void` を返すことを検証する
  - Slack 失敗が `logger.warn` に降格されないこと（named outcome による必須レッグの担保）を確認する（#1 回帰）
  - _Requirements: 3.2, 5.4_

- [x] 5.4 (P) Slack URL 未設定・HTTP エラー・ネットワーク断のテストを追加する
  - Slack URL 未設定時に DB 保存のみ実行され Slack fetch が呼ばれず、Sentry にも記録されないことを検証する（#3 回帰）
  - Slack が HTTP 4xx/5xx を返した場合に `sendToSlack()` が throw し `Sentry.captureException` が呼ばれることを検証する（#3 回帰）
  - Slack fetch が reject（ネットワーク断・AbortError）した場合にエラーが握りつぶされず Sentry に記録されることを検証する（#2 回帰）
  - _Requirements: 3.3, 3.4, 5.4_

- [x] 6. FeedbackController のユニットテストを更新する
  - `req.user.id` が `context.userId` として `submit()` に渡されることを検証する
  - `req.user.name` が `undefined` のとき `name: ''` にフォールバックすることを検証する
  - _Requirements: 2.2, 4.3_
