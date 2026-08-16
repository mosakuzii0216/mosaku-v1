# Implementation Plan

## Tasks

- [x] 1. Prisma スキーマに `trashedAt` フィールドを追加してマイグレーションを作成する
  - `Memo` モデルに `trashedAt DateTime? @map("trashed_at")` を追加する
  - `npx prisma migrate dev --name add_memo_trashed_at` でマイグレーションを作成・適用する
  - `npx prisma generate` で Prisma クライアントを再生成する
  - _Requirements: 1.1, 1.3_

- [x] 2. MemoService にゴミ箱機能を実装する
- [x] 2.1 既存の全取得・検索クエリにゴミ箱除外フィルターを追加する
  - `findAll` / `findAllPaginated` / `search` / `searchPaginated` の `where` 句に `trashedAt: null` を追加する
  - `BaseOwnableService.findAll()` のオーバーライドで `trashedAt: null` を確実に適用する
  - `findOne()` も `trashedAt: null` 条件を含めて通常メモのみを返すよう更新する
  - _Requirements: 1.4_

- [x] 2.2 ゴミ箱操作メソッドを実装する
  - `trash(id, userId)`: 所有者検証後に `trashedAt` を現在時刻に設定する
  - `findOneTrashed(id, userId)`: ゴミ箱内メモを1件取得して所有者を検証する（restore / permanentDelete 用）
  - `findTrashed(userId)`: 自分のゴミ箱内メモを `trashedAt` 降順で全件取得する
  - `restore(id, userId)`: `findOneTrashed` で検証後に `trashedAt` を null に設定する
  - `permanentDelete(id, userId)`: `findOneTrashed` で検証後にメモを物理削除する
  - `emptyTrash(userId)`: `userId` に紐づく `trashedAt != null` の全メモを `deleteMany` で削除する
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 4.1, 4.2, 6.1, 6.2_

- [x] 3. MemoController にゴミ箱エンドポイントを追加する
- [x] 3.1 `DELETE /memos/:id` をソフトデリートに変更する
  - `remove()` 呼び出しを `trash()` に置き換える
  - レスポンスは `trashedAt` を含む `Memo` オブジェクトを返す
  - _Requirements: 1.1_

- [x] 3.2 ゴミ箱専用エンドポイントを追加する
  - `GET /memos/trash`: `findTrashed(userId)` を呼び出して一覧を返す（`findAll` と衝突しないよう先に定義する）
  - `PATCH /memos/:id/restore`: `restore(id, userId)` を呼び出す
  - `DELETE /memos/:id/permanent`: `permanentDelete(id, userId)` を呼び出す
  - `DELETE /memos/trash`: `emptyTrash(userId)` を呼び出して `{ count: number }` を返す
  - すべてのエンドポイントに `JwtAuthGuard` が適用されていることを確認する
  - _Requirements: 2.1, 3.1, 4.1, 4.2, 4.3, 6.3_

- [x] 4. (P) 自動削除スケジューラーを実装する
  - `@nestjs/schedule` パッケージを `backend/package.json` に追加する
  - `AppModule` で `ScheduleModule.forRoot()` を登録する
  - `TrashCleanupService` を `MemoModule` の providers として実装する
  - `@Cron('0 17 * * *')` (UTC 17:00 = JST 02:00) で30日以上前の `trashedAt` を持つメモを `deleteMany` で削除する
  - 削除件数を `logger.log` に記録する
  - _Requirements: 5.1, 5.2_

- [x] 5. フロントエンドの API クライアントとクエリキーを拡張する
  - `queryKeys.memos` に `trash: () => [...queryKeys.memos.all, 'trash'] as const` を追加する
  - `apiClient`（`utils/api.ts`）に `getTrashMemos / restoreMemo / permanentDeleteMemo / emptyTrash` の4関数を追加する（`apiClient.deleteMemo` は変更不要）
  - フロントエンドの `Memo` 型に `trashedAt: string | null` を追加する
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.2_

- [x] 6. ゴミ箱専用 React Query フックを `useMemoQueries.ts` に追加する
  - `useTrashMemos`: `GET /memos/trash` を取得する `useQuery` フック
  - `useRestoreMemo`: `PATCH /memos/:id/restore` を呼び出し、成功後に `queryKeys.memos.all` を invalidate する `useMutation` フック
  - `usePermanentDeleteMemo`: `DELETE /memos/:id/permanent` を呼び出し、成功後に `queryKeys.memos.trash()` を invalidate する `useMutation` フック
  - `useEmptyTrash`: `DELETE /memos/trash` を呼び出し、成功後に `queryKeys.memos.trash()` を invalidate する `useMutation` フック
  - _Requirements: 2.1, 2.4, 3.1, 4.1, 4.2, 4.3_

- [x] 7. ゴミ箱ビューとナビゲーションを実装する
- [x] 7.1 `ViewType` と `useViewStore` にゴミ箱ナビゲーションを追加する
  - `ViewType` に `'trash'` を追加する
  - `useViewStore` に `goToTrash()` ヘルパーを追加する（`currentObject: 'memo', currentView: 'trash'`）
  - サイドバーコンポーネントにゴミ箱リンクを追加し、`goToTrash()` を呼び出す
  - _Requirements: 2.1_

- [x] 7.2 `TrashView` コンポーネントを実装する
  - `useTrashMemos` でゴミ箱内メモ一覧を取得して表示する
  - 各メモアイテムにタイトル・削除日時・自動削除までの残日数（`30 - daysSinceTrashed` 日）を表示する
  - 各メモに「復元」ボタン（`useRestoreMemo`）と「完全削除」ボタン（`usePermanentDeleteMemo`）を配置する
  - ヘッダーに「ゴミ箱を空にする」ボタン（`useEmptyTrash`）を配置し、ゴミ箱が空のときは無効化する
  - ゴミ箱が空の場合は空状態メッセージを表示する
  - `window.confirm` は使用しない（audit C-1 準拠）
  - Layout コンポーネントで `currentView === 'trash'` のときに `TrashView` を描画する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 4.1, 4.2, 4.3_

- [x] 8. TypeScript ビルドチェックと動作確認を行う
  - `cd frontend && npx tsc --noEmit` と `cd backend && npx tsc --noEmit` で型エラーがないことを確認する
  - ローカルでメモを削除するとゴミ箱に移動し通常一覧から消えることを確認する
  - ゴミ箱から復元すると通常一覧に戻りノートブック・タグが維持されることを確認する
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 6.1_

- [x]\* 9. バックエンドユニットテストを追加する（任意）
  - `MemoService.trash()` で `trashedAt` が設定されること
  - `MemoService.findAll()` がゴミ箱メモを返さないこと
  - `MemoService.restore()` で `trashedAt` が null に戻ること
  - `TrashCleanupService` が30日超のメモのみ削除すること（Jest fake timers）
  - `DELETE /memos/:id` で 403 / 404 が返ること（他ユーザー・存在しない ID）
  - _Requirements: 1.1, 1.4, 3.1, 5.1, 6.1, 6.2, 6.3_
