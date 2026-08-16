# Research & Design Decisions — feedback-db-persistence

---

## Summary

- **Feature**: `feedback-db-persistence`
- **Discovery Scope**: Extension（既存 FeedbackService への DB 永続化追加）
- **Key Findings**:
  - `FeedbackService.submit()` は現在 Slack Webhook のみ。PrismaService の注入で DB 保存を追加する最小変更で対応可能
  - コントローラーは `req.user.id` を持つが、現在サービスに渡していない。`submit()` のコンテキスト引数に `userId` を追加する必要あり
  - 全モデルが `@id @default(cuid())` を使用。要件の「UUID」は cuid で代替（プロジェクト標準準拠）

---

## Research Log

### 既存 FeedbackService の構造

- **Context**: submit() 変更スコープの特定
- **Sources Consulted**: `backend/src/feedback/feedback.service.ts`, `feedback.controller.ts`, `feedback.service.spec.ts`, `feedback.controller.spec.ts`
- **Findings**:
  - `FeedbackService` の依存は `ConfigService` のみ
  - `submit(dto, sender: { name; email })` — userId を受け取らない
  - Slack 失敗時は `Sentry.captureException` + 例外を飲み込む（既存）
  - コントローラーは `req.user.id` を保持しているが service に渡していない
  - 現行の controller.spec では submit の呼び出しを `(dto, { name, email })` で検証→ userId 追加後は更新必須
- **Implications**: `submit()` のコンテキスト引数を `{ userId; name; email }` に統合し、controller も合わせて修正

### PrismaModule 利用パターン

- **Context**: FeedbackModule への PrismaService 注入方法の確認
- **Sources Consulted**: `backend/src/prisma/prisma.module.ts`, `backend/src/memo/memo.module.ts`
- **Findings**:
  - `PrismaModule` は `exports: [PrismaService]` を持つ共有モジュール
  - 各ドメインモジュールは `imports: [PrismaModule]` のみで PrismaService を利用可能
  - `FeedbackModule` は現在 PrismaModule を import していない
- **Implications**: `FeedbackModule` に `PrismaModule` を追加するだけで完結

### Prisma スキーマの ID・enum 規約

- **Context**: Feedback モデルの ID 型と enum 命名の確認
- **Sources Consulted**: `backend/prisma/schema.prisma`
- **Findings**:
  - 全モデル ID: `String @id @default(cuid())`（UUID は未使用）
  - 既存 enum: `UserRole { USER ADMIN }`、`RefreshTokenStatus { active rotated revoked }`（大文字・小文字混在）
  - DTO の `FeedbackCategory` enum は `'bug' | 'improvement' | 'other'`（小文字）
- **Implications**: Prisma enum も小文字で定義（`bug / improvement / other`）してマッピング不要に。ID は cuid を使用（要件の「UUID」はプロジェクト慣習に従い cuid で代替）

### Promise.allSettled パターンの適用

- **Context**: Slack・DB の並列実行と独立エラーハンドリング
- **Sources Consulted**: 要件 2.4、3.1–3.4
- **Findings**:
  - `Promise.allSettled` は両 Promise の成否を独立して受け取れる
  - DB 失敗のみ上位に伝播させ、Slack 失敗は warn ログで吸収するパターンが要件と合致
  - Slack URL 未設定時は `Promise.resolve()` を Slack 側に渡すことで統一的に処理可能
- **Implications**: sendToSlack を private メソッドに抽出し、URL 未設定なら即 resolve する実装で `Promise.allSettled` の構造を保持

---

## Architecture Pattern Evaluation

| Option                  | Description                                   | Strengths                                  | Risks / Limitations                                        | Notes                                           |
| ----------------------- | --------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| Promise.allSettled 並列 | Slack + DB を同時実行、結果ごとにハンドリング | レスポンスタイム最短、独立エラー処理が明確 | allSettled の結果型を正しく narrowing する必要あり         | 要件 2.4 が明示的に指定                         |
| Slack → DB 直列         | 先に Slack、次に DB                           | シンプル                                   | Slack 遅延が DB 遅延に加算、Slack 失敗で DB が実行されない | 要件 3.1 に違反（Slack 失敗でも DB 保存すべき） |
| DB → Slack 直列         | 先に DB、次に Slack                           | DB 成功を保証してから通知                  | Slack 失敗でも DB 済みなので問題ないが並列より遅い         | 要件 2.4 の並列指定に違反                       |

**選択**: `Promise.allSettled` 並列実行

---

## Design Decisions

### Decision: `submit()` コンテキスト引数の統合

- **Context**: DB 保存に userId が必要だが現在 service に渡っていない
- **Alternatives Considered**:
  1. userId を第三引数として追加 — 引数が3個になりシグネチャが冗長
  2. `sender` 型に `userId` を追加して統合 — 型名を `FeedbackSubmitContext` に変更しセマンティクスを整理
- **Selected Approach**: `FeedbackSender` を廃止し `FeedbackSubmitContext { userId; name; email }` に一本化。コントローラーが `req.user.id` を追加して渡す
- **Rationale**: 引数数を増やさずコンテキストを拡張可能にする。既存テストの更新箇所も1か所に集約
- **Trade-offs**: controller.spec の期待値を `{ userId, name, email }` に更新する必要あり
- **Follow-up**: `feedback.controller.spec.ts` の assert 更新を実装タスクに含める

### Decision: `sendToSlack()` のプライベートメソッド抽出

- **Context**: `Promise.allSettled` 構造の中で Slack URL 未設定時の分岐を整理
- **Alternatives Considered**:
  1. submit 内でインライン条件分岐 — ネストが深くなり読みにくい
  2. private `sendToSlack()` メソッドに抽出 — URL 未設定なら即 resolve
- **Selected Approach**: `private sendToSlack(dto, context): Promise<void>` を抽出。URL なしなら early return（Promise.resolve 相当）
- **Rationale**: submit のメインロジックがシンプルになりテストしやすい
- **Trade-offs**: メソッドが1本増えるが複雑性は下がる

---

## Risks & Mitigations

- **DB 保存失敗時の二重 reject** — `Promise.allSettled` は例外を throw しないため、reject 後に明示的に `throw` が必要。実装時に忘れないようタスクに記載
- **Sentry タグ規約の漏れ** — `feature_area: 'system'` を DB 失敗に付与する必要あり（既存 Slack 失敗と同じタグ）
- **controller.spec の更新忘れ** — `userId` 追加後のアサーションを忘れると CI が落ちるため、実装タスクに明示的に含める

---

## References

- NestJS DI パターン: `backend/src/memo/memo.module.ts`（PrismaModule import 例）
- Prisma schema 規約: `backend/prisma/schema.prisma`（既存 enum・@@map 例）
- Sentry タグ契約: `.kiro/steering/tech.md`（`feature_area` enum）
- 既存 FeedbackService テスト: `backend/src/feedback/feedback.service.spec.ts`
