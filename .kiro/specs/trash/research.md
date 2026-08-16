# Research & Design Decisions

---

## Summary

- **Feature**: `trash`
- **Discovery Scope**: Extension（既存 MemoService への機能追加）
- **Key Findings**:
  - `MemoService.remove()` が `BaseOwnableService` の hard delete を呼ぶ。`DELETE /memos/:id` のセマンティクスを soft delete に変更することで、フロントエンドの `useDeleteMemo` は変更不要
  - `Memo` モデルに `trashedAt DateTime?` を追加するのが最小変更。既存全クエリに `{ trashedAt: null }` フィルターを追加する必要がある
  - 自動削除は `@nestjs/schedule`（未導入）の新規追加が必要

---

## Research Log

### 既存削除フロー分析

- **Context**: soft delete 実装時に既存 API の変更範囲を把握するため
- **Findings**:
  - `DELETE /memos/:id` → `MemoService.remove()` → `BaseOwnableService.remove()` → `prisma.memo.delete()`
  - フロントエンド `useDeleteMemo` はこのエンドポイントのみを使用
  - `findAll` / `findAllPaginated` / `search` / `searchPaginated` はすべて `{ userId }` のみでフィルター。`trashedAt: null` 条件を追加する必要がある
- **Implications**: `DELETE /memos/:id` を soft delete に変えれば UI 側の変更は最小限。ゴミ箱固有の操作（復元・完全削除・一覧・一括削除）は新規エンドポイントとして追加

### スケジューラ選定

- **Context**: 30日自動削除のバックグラウンド処理の実装方式
- **Findings**:
  - `@nestjs/schedule` は NestJS 公式ライブラリ。`@Cron` デコレータで定期実行可能
  - Cloud Run はリクエスト駆動のためスリープ状態になりうる。ただし min-instances=1 設定済みなら常時起動
  - 代替: Cloud Scheduler + HTTP エンドポイント。ただし運用複雑性が増す
- **Implications**: `@nestjs/schedule` + `@Cron('0 2 * * *')` (毎日午前2時) が最小コスト

---

## Architecture Pattern Evaluation

| Option                     | Description                                                         | Strengths                            | Risks / Limitations                                    |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| `trashedAt` フィールド追加 | `Memo` に nullable の datetime を追加。null = 通常、非null = ゴミ箱 | 最小スキーマ変更、復元が UPDATE のみ | 全クエリへのフィルター追加忘れリスク                   |
| 別テーブル `trash_memos`   | ゴミ箱専用テーブルに移動                                            | クエリ変更なし                       | 移動操作が複雑、関連テーブル（memoTags）の整合性が面倒 |

**選択**: `trashedAt` フィールド追加。単一テーブルで管理でき、Prisma の型安全性を最大活用できる。

---

## Design Decisions

### Decision: `DELETE /memos/:id` のセマンティクス変更

- **Context**: 既存フロントエンドの `useDeleteMemo` を変更せずに soft delete を実現する
- **Alternatives Considered**:
  1. 新規 `PATCH /memos/:id/trash` を追加し、`DELETE /memos/:id` は廃止
  2. `DELETE /memos/:id` を soft delete に変更し、完全削除は `DELETE /memos/:id/permanent` を新設
- **Selected Approach**: Option 2。`DELETE /memos/:id` = soft delete、`DELETE /memos/:id/permanent` = 完全削除
- **Rationale**: フロントエンドの `useDeleteMemo` を変更不要。REST 的に DELETE は削除意図を表すので soft delete でも意味的に問題ない
- **Trade-offs**: 既存の hard delete 挙動が変わるため、移行後の動作確認が必須

### Decision: `@nestjs/schedule` の新規追加

- **Context**: 30日自動削除のスケジューラ実装
- **Selected Approach**: `@nestjs/schedule` パッケージ追加 + `TrashCleanupService` の `@Cron` ジョブ
- **Rationale**: NestJS 公式、最小追加コスト。Cloud Scheduler は運用複雑性が増すため採用しない
- **Trade-offs**: Cloud Run がスリープ状態の場合、スケジュール実行が遅れる可能性がある。許容範囲（30日の精度は±1日で十分）

---

## Risks & Mitigations

- 既存クエリの `trashedAt: null` フィルター追加漏れ → `MemoService` の全 `findMany` を網羅的に確認
- `BaseOwnableService.findOne()` がゴミ箱内メモを findOne できてしまう → `findOne` にも `trashedAt: null` 条件が必要かを判断（復元・完全削除では findOne でゴミ箱内メモを取得する必要があるため、専用メソッドを分ける）
- `findOne` のフィルターについては、trash操作用に `findOneTrashed()` を追加し通常の `findOne` は `trashedAt: null` のみを返す
