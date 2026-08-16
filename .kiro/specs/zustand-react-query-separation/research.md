# Research & Design Decisions

---

**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.

---

## Summary

- **Feature**: `zustand-react-query-separation`
- **Discovery Scope**: Extension（既存システムへの変更）
- **Key Findings**:
  - `useMemoStore` のすべてのナビゲーションアクションは `useViewStore` + `useMemoDataStore` をまたぐ複合アクションであり、どちらか一方のストアに自然に収まるものはない
  - 複合アクションを利用しているコンポーネントは 6 ファイル（MobileLayout, DesktopLayout, Header, NotebookList, MemoList, MemoPalette）、単純な状態読み書きのみのコンポーネントは 2 ファイル（App, MemoSearch）
  - `useNavigation` カスタムフックの新設が最もプロジェクトパターンに整合する解決策であり、既存の `useMemoQueries`, `useNotebookQueries` 等の命名規則とも一致する

## Research Log

### クロスストア複合アクションの調査

- **Context**: `useMemoStore` 廃止後、`goToEdit` 等の複合アクションの置き場所を決定する必要があった
- **Sources Consulted**: `stores/useMemoStore.ts`, `stores/useViewStore.ts`, `stores/useMemoDataStore.ts`, `stores/usePaletteStore.ts` を精査
- **Findings**:
  - `useMemoStore` に定義された 9 つのナビゲーションアクション（`goToEdit`, `goToList`, `goToMemoCreate`, `goToNotebookCreate`, `goToNotebookEdit`, `goToNotebookList`, `goToMemosForNotebook`, `goToTags`, `goToTrash`）は全て `useViewStore` + `useMemoDataStore` の両方を更新する
  - `useViewStore` 単体の `goToList()` 等は `selectedMemoId` のリセットを行わない。`useMemoStore.goToList()` は `dataStore.setSelectedMemoId(null)` を追加で呼ぶ
  - `usePaletteStore` はナビゲーションと独立しており、複合アクションに関与しない
- **Implications**: `useNavigation` フックで全複合アクションを集約し、状態リセットの一貫性を保つ必要がある

### コンポーネント別使用状況の調査

- **Context**: 各ファイルが `useMemoStore` から何を利用しているかをマッピング
- **Findings**:
  - `App.tsx`: `isMobile`, `setIsMobile` → `useViewStore` のみ
  - `MemoSearch.tsx`: `searchQuery`, `setSearchQuery` → `useViewStore` のみ
  - `Header.tsx`: 状態読み取り（`currentView`, `currentObject`）は `useViewStore`、アクション（`goToList`, `goToTags`, `goToNotebookList`, `goToTrash`）は `useNavigation`
  - `NotebookList.tsx`: アクション（`goToMemosForNotebook`, `goToNotebookEdit`, `goToNotebookCreate`）のみ → `useNavigation` のみ
  - `MemoList.tsx`: 状態（`notebookFilter`）は `useViewStore`、アクション（`goToEdit`）は `useNavigation`
  - `MemoPalette.tsx`: 状態（`paletteNotebookFilter`）は `usePaletteStore`、アクション（`goToEdit`）は `useNavigation`
  - `MobileLayout.tsx`, `DesktopLayout.tsx`: 3 ストア全て + `useNavigation`

## Architecture Pattern Evaluation

| Option                          | Description                                              | Strengths                                 | Risks / Limitations                                                   | Notes                                                |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| A: コールサイトインライン       | 複合アクションを各コンポーネントで直接 setter を複数呼ぶ | 新規ファイル不要                          | goToEdit が MemoList / MemoPalette に重複、ナビゲーションロジック散在 | 2 ファイルだけなら許容できなくもないが可読性が下がる |
| B: useNavigation フック（採用） | `hooks/useNavigation.ts` を新設し複合アクションを集約    | プロジェクトパターンに合致、DRY、発見容易 | 新規ファイル 1 つ追加                                                 | hooks/ に既存の useMemoQueries 等と並列に配置        |
| C: useViewStore に集約          | useViewStore 内部で useMemoDataStore を参照              | ファイル追加なし                          | ストア間依存が発生、useViewStore の責務違反                           | 非推奨                                               |

**採用**: Option B（`useNavigation` カスタムフック）

## Design Decisions

### Decision: `useNavigation` フックの責務範囲

- **Context**: どのアクションを `useNavigation` に含めるか
- **Alternatives Considered**:
  1. 全複合アクション 9 つを含める
  2. `goToEdit` のみ含め、残りはコンポーネントでインライン展開
- **Selected Approach**: `useMemoStore` に存在した 9 つの複合ナビゲーションアクション全てを `useNavigation` に移管する
- **Rationale**: 一貫性と発見容易性。「ナビゲーションしたい場合は `useNavigation` を使う」というルールが明確になる
- **Trade-offs**: `goToTags` 等は `useMemoDataStore` の変更（`selectedMemoId` を null にする）が軽微だが、一貫性のために全て含める
- **Follow-up**: 実装時に `useMemoStore` から `useNavigation` へのアクション一覧が漏れなく移管されているか確認

### Decision: 状態読み取りは個別ストアを直接使用

- **Context**: 状態の読み取り（`currentView`, `notebookFilter` 等）も `useNavigation` 経由にするか
- **Alternatives Considered**:
  1. 状態も含めた大きな `useNavigation` フック
  2. アクションのみ `useNavigation`、状態は個別ストアを直接 import
- **Selected Approach**: アクションのみ `useNavigation`、状態は個別ストア直接
- **Rationale**: `useNavigation` は「副作用を伴うナビゲーション操作」に責務を絞る。状態読み取りは依存ストアを明示する方が可読性が高い
- **Trade-offs**: 一部コンポーネントで複数 import が必要になるが、依存関係が明確になる

## Risks & Mitigations

- `goToList` 等が `useViewStore` にも同名メソッドで存在する — 実装時に `useViewStore.goToList` と `useNavigation.goToList` を混同しないよう注意。`useNavigation` のみを使うことをコード規約化する
- MobileLayout / DesktopLayout で import が増える（4 つ）— コンポーネントの複雑度自体は変わらないため許容範囲
- テストフレームワーク未導入のため手動確認が必要 — ビルドの成功と目視確認で代替

## References

- `frontend/src/stores/useMemoStore.ts` — 後方互換ラッパーの全アクション定義
- `frontend/src/stores/useViewStore.ts` — ナビゲーション状態ストア
- `frontend/src/stores/useMemoDataStore.ts` — 選択 ID ストア
- `frontend/src/stores/usePaletteStore.ts` — パレット状態ストア
- `.kiro/specs/zustand-react-query-separation/gap-analysis.md` — 詳細ギャップ分析
