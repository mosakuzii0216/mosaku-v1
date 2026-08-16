# Implementation Plan

## Tasks

- [x] 1. `useAutoSave` フックを実装する
- [x] 1.1 デバウンスタイマーと SaveStatus 状態機械を実装する
  - `idle / pending / saving / saved / error` の5状態を管理する
  - `scheduleAutoSave()` を実装する: 既存タイマーをクリアし新しいタイマーを設定する。`canSave` が true なら `pending` に遷移する
  - タイマー発火時に `canSave && !isSaving` を評価し、条件を満たす場合のみ `onSave()` を呼び出して `saving` に遷移する
  - `onSave` resolve 時に `saved` へ遷移し、2秒後に `idle` へ自動リセットする
  - `onSave` reject 時に `error` へ遷移する
  - `cancelDebounce()` を公開する: 実行中のタイマーをクリアする（手動保存から呼び出す）
  - `debounceMs` のデフォルト値を2000ミリ秒とする
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 4.1, 4.2, 4.3_

- [x] 1.2 アンマウント時とメモ切り替え時のタイマークリーンアップを実装する
  - `useEffect` の cleanup 関数でタイマーをキャンセルし、アンマウント後にタイマーが発火しないようにする
  - `memo` prop の変更（メモ切り替え）を検知して `cancelDebounce()` を呼び出し、前のメモに対するタイマーを破棄する
  - _Requirements: 4.4_

- [x] 2. `MemoEditor` にデバウンス自動保存を統合する
- [x] 2.1 フィールド変更でデバウンスをトリガーし、手動保存と共存させる
  - `useAutoSave` フックを MemoEditor で呼び出す（`canSave`・`isSaving`・`onSave` を渡す）
  - title・content・tags・notebook の各 onChange ハンドラーで `scheduleAutoSave()` を追加呼び出しする
  - 手動保存ボタンのクリックハンドラーで `cancelDebounce()` を実行してからすぐに保存処理を呼び出す
  - Cmd+S / Ctrl+S のキーボードショートカット処理でも同様に `cancelDebounce()` を実行してから保存する
  - 保存中（`isSaving`）は手動保存ボタンを無効化する（既存動作を維持）
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2.2 create モードの自動保存成功後に edit モードへ遷移させる
  - `createMemo.mutate` の `onSuccess` コールバック内で `useMemoDataStore` の `setSelectedMemoId(result.id)` を呼び出す
  - 続けて `useViewStore` の `setCurrentView('edit')` を呼び出してエディターを edit モードへ切り替える
  - これにより以降のデバウンス発火が updateMemo を使用するようになることを確認する
  - _Requirements: 1.3_

- [x] 3. 保存状態インジケーター UI を実装する
  - MemoEditor ヘッダーの保存ボタン付近に `saveStatus` に基づくインジケーターを表示する
  - `idle`: 非表示（何も表示しない）
  - `pending`: 「未保存」をグレーテキストで表示する
  - `saving`: 「保存中...」をブルーテキストで表示する
  - `saved`: 「保存済み」をグリーンテキストで表示する
  - `error`: 「保存失敗 — 手動保存してください」をレッドテキストで表示する
  - 既存の「未保存の変更があります」テキストをインジケーターに置き換える
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. TypeScript ビルドチェックと動作確認を行う
  - `cd frontend && npx tsc --noEmit` を実行して型エラーがないことを確認する
  - ローカル開発サーバーで編集停止後2秒でサーバーへ保存リクエストが送信されることを確認する
  - 手動保存ボタンが即時保存かつデバウンスキャンセルとして動作することを確認する
  - create モードで自動保存後に edit モードへ遷移し重複作成が起きないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.3, 4.4_

- [x]\* 5. `useAutoSave` のユニットテストを追加する（任意）
  - Jest fake timers を使って `scheduleAutoSave()` 後2000ms で `onSave` が呼ばれることを確認する
  - `canSave = false` の場合 `onSave` が呼ばれないことを確認する
  - `isSaving = true` の場合タイマー発火時にスキップされることを確認する
  - `cancelDebounce()` 後にタイマーが発火しないことを確認する
  - アンマウント後にタイマーが発火しないことを確認する
  - `onSave` reject 時に `saveStatus === 'error'` になることを確認する
  - _Requirements: 1.1, 1.2, 1.4, 4.1, 4.2, 4.3, 4.4_
