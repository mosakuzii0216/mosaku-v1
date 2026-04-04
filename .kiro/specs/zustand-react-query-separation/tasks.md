# Implementation Plan

- [x] 1. useNavigation フックを新設する
  - `NavigationActions` 型インターフェースで9つの複合ナビゲーションアクション（goToEdit, goToList, goToMemoCreate, goToNotebookCreate, goToNotebookEdit, goToNotebookList, goToMemosForNotebook, goToTags, goToTrash）を定義する
  - useViewStore と useMemoDataStore を組み合わせ、既存の useMemoStore に定義されたアクションと同一の状態遷移（goToEdit は selectedMemoId を設定、goToList は selectedMemoId をリセット等）を再現する
  - `any` 型を使わず NavigationActions インターフェースで完全な型安全性を保証する
  - `frontend/src/hooks/useNavigation.ts` として配置し、既存の useMemoQueries 等と同じ hooks/ ディレクトリ規則に従う
  - _Requirements: 1.2, 1.3, 1.4, 4.1, 4.2, 4.3_

- [ ] 2. useViewStore のみに依存するコンポーネントを移行する

- [x] 2.1 (P) App.tsx の依存を useMemoStore から useViewStore に差し替える
  - useMemoStore の import を除去し useViewStore を直接 import する
  - `isMobile` と `setIsMobile` を useViewStore から取得するよう変更する
  - レスポンシブ判定の動作（width < 768 で isMobile を更新するロジック）が変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2.2 (P) MemoSearch.tsx の依存を useMemoStore から useViewStore に差し替える
  - useMemoStore の import を除去し useViewStore を直接 import する
  - `searchQuery` と `setSearchQuery` を useViewStore から取得するよう変更する
  - デバウンス処理を含む検索入力の動作が変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 3. useNavigation を使うコンポーネントを移行する（Task 1 完了後）

- [x] 3.1 (P) Header.tsx を useViewStore と useNavigation に移行する
  - useMemoStore の import を除去する
  - `currentView`・`currentObject` は useViewStore から取得する
  - `goToList`・`goToTags`・`goToNotebookList`・`goToTrash` は useNavigation から取得する
  - ナビゲーションボタンのアクティブ状態表示と画面遷移の動作が変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3.2 (P) NotebookList.tsx の依存を useMemoStore から useNavigation に差し替える
  - useMemoStore の import を除去し useNavigation を直接 import する
  - `goToMemosForNotebook`・`goToNotebookEdit`・`goToNotebookCreate` を useNavigation から取得する
  - ノートブックカードのクリック遷移と編集ボタンの動作が変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3.3 (P) MemoList.tsx を useViewStore と useNavigation に移行する
  - useMemoStore の import を除去する
  - `notebookFilter` は useViewStore から取得する
  - `goToEdit` は useNavigation から取得する
  - ノートブックフィルタリングとメモクリック時の編集画面遷移が変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3.4 (P) MemoPalette.tsx を usePaletteStore と useNavigation に移行する
  - useMemoStore の import を除去する
  - `paletteNotebookFilter` は usePaletteStore から取得する
  - `goToEdit` は useNavigation から取得する
  - パレット経由でのメモ選択・編集遷移が変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. レイアウトコンポーネントを移行する（Task 1 完了後、Task 3 と並行可）

- [x] 4.1 (P) MobileLayout.tsx を3ストアと useNavigation に移行する
  - useMemoStore の import を除去する
  - `currentObject`・`currentView` は useViewStore から取得する
  - `selectedMemoId`・`selectedNotebookId` は useMemoDataStore から取得する
  - `paletteOpen`・`paletteMode`・`closeMemoPalette`・`openMemoPalette` は usePaletteStore から取得する
  - `goToMemoCreate`・`goToNotebookCreate` は useNavigation から取得する
  - キーボードショートカット（Cmd+N, Cmd+K, Cmd+P）と画面切り替えが変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4.2 (P) DesktopLayout.tsx を3ストアと useNavigation に移行する
  - MobileLayout.tsx と同一のストア・フック構成で移行する（useViewStore, useMemoDataStore, usePaletteStore, useNavigation）
  - キーボードショートカットと画面切り替えが変わらないことを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 5. useMemoStore を削除してビルドと動作を確認する

- [x] 5.1 useMemoStore.ts を削除してビルドが通ることを確認する
  - `frontend/src/stores/useMemoStore.ts` を削除する
  - `npm run build` を実行してコンパイルエラーが発生しないことを確認する（TypeScript の型エラーがないことが移行完了の客観的証明となる）
  - useMemoStore の再エクスポート（useViewStore・useMemoDataStore・usePaletteStore）に依存するコードが残っていないことをビルド結果で確認する
  - Zustand ストアがサーバーデータ（メモ・ノートブック・タグの API レスポンス）を保持していないことをコードレビューで確認する
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_

- [ ]\* 5.2 主要ユーザー操作の動作を手動で確認する
  - メモ一覧からメモをクリックして編集画面に遷移できること
  - ヘッダーのナビゲーションボタン（ノートブック・タグ・ゴミ箱）が正しく画面遷移すること
  - コマンドパレット（Cmd+K）でメモを選択して編集画面に遷移できること
  - ノートブック一覧からノートブック・メモ一覧への遷移が正しく動作すること
  - モバイル・デスクトップ両レイアウトで上記が動作すること
  - _Requirements: 1.4_
