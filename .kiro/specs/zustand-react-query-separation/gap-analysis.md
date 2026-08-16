# Gap Analysis: zustand-react-query-separation

## 分析サマリー

- **スコープ**: フロントエンドのみ。バックエンド変更なし
- **主な課題**: `goToEdit` 等の**クロスストア複合アクション**の置き場が `useMemoStore` 廃止後に未決定
- **既存資産の充実度**: 各個別ストアはすでに完成しており、移行先は明確
- **推奨**: 複合ナビゲーションアクションを集約するカスタムフック `useNavigation` を新設するハイブリッドアプローチ
- **工数/リスク**: **S**（1〜3日）/ **Low**（確立されたパターン内、TypeScript がガード）

---

## 1. 現状調査

### 個別ストアの状態

| ストア             | ファイル                     | 責務                         | 状態     |
| ------------------ | ---------------------------- | ---------------------------- | -------- |
| `useViewStore`     | `stores/useViewStore.ts`     | 表示モード・ナビゲーション   | 完成済み |
| `useMemoDataStore` | `stores/useMemoDataStore.ts` | 選択中メモ/ノートブック ID   | 完成済み |
| `usePaletteStore`  | `stores/usePaletteStore.ts`  | パレット開閉・モード         | 完成済み |
| `useMemoStore`     | `stores/useMemoStore.ts`     | 後方互換ラッパー（廃止対象） | 削除予定 |

### useMemoStore 使用箇所（8ファイル）

| ファイル            | 使用しているプロパティ/アクション                                                                                                                                                   | 移行先ストア                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `App.tsx`           | `isMobile`, `setIsMobile`                                                                                                                                                           | `useViewStore` のみ                    |
| `Header.tsx`        | `currentView`, `currentObject`, `goToList`, `goToTags`, `goToNotebookList`, `goToTrash`                                                                                             | `useViewStore` のみ                    |
| `MemoSearch.tsx`    | `searchQuery`, `setSearchQuery`                                                                                                                                                     | `useViewStore` のみ                    |
| `NotebookList.tsx`  | `goToMemosForNotebook`, `goToNotebookEdit`, `goToNotebookCreate`                                                                                                                    | `useViewStore` のみ                    |
| `MemoList.tsx`      | `notebookFilter`, **`goToEdit`**                                                                                                                                                    | `useViewStore` + **複合アクション**    |
| `MemoPalette.tsx`   | **`goToEdit`**, `paletteNotebookFilter`                                                                                                                                             | `usePaletteStore` + **複合アクション** |
| `MobileLayout.tsx`  | `currentObject`, `currentView`, `selectedMemoId`, `selectedNotebookId`, `goToMemoCreate`, `goToNotebookCreate`, `paletteOpen`, `paletteMode`, `closeMemoPalette`, `openMemoPalette` | 3ストア全て（複合アクション含む）      |
| `DesktopLayout.tsx` | 同上（MobileLayout と同一）                                                                                                                                                         | 3ストア全て（複合アクション含む）      |

---

## 2. 要件実現性分析

### Requirement 1 & 2: 使用箇所の移行 → ファイル削除

**技術的ニーズ**: `useMemoStore` が提供する全プロパティ/アクションの移行先を確定する

#### 単純移行（問題なし）

以下は1対1で個別ストアに対応しており、import 変更のみで移行完了：

- `App.tsx` → `useViewStore` へ直接変更
- `Header.tsx` → `useViewStore` へ直接変更
- `MemoSearch.tsx` → `useViewStore` へ直接変更
- `NotebookList.tsx` → `useViewStore` へ直接変更

#### ⚠️ 主要ギャップ: クロスストア複合アクション

`useMemoStore` には `useViewStore` と `useMemoDataStore` を **またぐ複合アクション**が存在する：

```typescript
// useMemoStore の goToEdit（廃止予定）
goToEdit: (memo: Memo) => {
    viewStore.setCurrentObject('memo');    // useViewStore
    viewStore.setCurrentView('edit');      // useViewStore
    viewStore.setIsEditing(true);          // useViewStore
    dataStore.setSelectedMemoId(memo.id); // useMemoDataStore ← ここが分かれる
},

// 同様の複合アクション
goToList      → viewStore.goToList() + dataStore.setSelectedMemoId(null)
goToMemoCreate → viewStore.goToMemoCreate() + dataStore.setSelectedMemoId(null)
goToNotebookCreate → viewStore + dataStore 両方リセット
goToNotebookEdit → viewStore + dataStore.setSelectedNotebookId(id)
goToMemosForNotebook → viewStore + dataStore.setSelectedMemoId(null)
goToTags / goToTrash → viewStore + dataStore.setSelectedMemoId(null)
```

`goToEdit` は `MemoList.tsx` と `MemoPalette.tsx` の2箇所で使用。
その他の複合アクションは `MobileLayout.tsx` / `DesktopLayout.tsx` で使用。

**制約**: `useViewStore` は Zustand `create()` で定義されており、内部から `useMemoDataStore` を参照するとクロスストア依存が生まれ、ストアの独立性が壊れる。

### Requirement 3: Zustand/React Query 責務境界

**ギャップなし**。現時点で各個別ストアはサーバーデータを保持していない。移行後も維持される。

### Requirement 4: 型安全性

**ギャップなし**。TypeScript strict mode が既に有効。移行時のコンパイルが通ることが証明になる。`any` 型の新規導入リスクは低い。

---

## 3. 実装アプローチ選択肢

### Option A: コールサイトでアトミックアクションをインライン展開

複合アクションを使うコンポーネントが `useViewStore` と `useMemoDataStore` を両方 import し、複数の setter を直接呼ぶ。

```typescript
// MemoList.tsx の例
const { notebookFilter, setCurrentObject, setCurrentView, setIsEditing } = useViewStore();
const { setSelectedMemoId } = useMemoDataStore();

const handleGoToEdit = (memo: Memo) => {
	setCurrentObject('memo');
	setCurrentView('edit');
	setIsEditing(true);
	setSelectedMemoId(memo.id);
};
```

**トレードオフ**:

- ✅ 新規ファイル不要、最小変更
- ✅ 間接層を完全に排除
- ❌ `goToEdit` のロジックが `MemoList` と `MemoPalette` に重複
- ❌ ナビゲーションロジックが UI コンポーネントに散在し、発見しづらい

### Option B: useNavigation カスタムフックの新設（推奨）

`frontend/src/hooks/useNavigation.ts` を作成し、クロスストア複合アクションをここに集約する。コンポーネントは `useNavigation` と必要な個別ストアを直接 import する。

```typescript
// hooks/useNavigation.ts（新規）
export const useNavigation = () => {
	const viewStore = useViewStore();
	const { setSelectedMemoId, setSelectedNotebookId } = useMemoDataStore();

	return {
		goToEdit: (memo: Memo) => {
			viewStore.setCurrentObject('memo');
			viewStore.setCurrentView('edit');
			viewStore.setIsEditing(true);
			setSelectedMemoId(memo.id);
		},
		goToList: () => {
			viewStore.goToList();
			setSelectedMemoId(null);
		},
		// ... 他の複合アクション
	};
};

// MemoList.tsx の例（移行後）
import { useViewStore } from '../../stores/useViewStore';
import { useNavigation } from '../../hooks/useNavigation';

const { notebookFilter } = useViewStore();
const { goToEdit } = useNavigation();
```

**トレードオフ**:

- ✅ 複合ナビゲーションロジックの DRY 化
- ✅ プロジェクトの `hooks/` パターンに合致（`useMemoQueries`, `useNotebookQueries` と同一構造）
- ✅ `useMemoStore` の完全廃止を達成しつつロジックを保持
- ❌ 新規ファイル1つ追加
- ❌ 「個別ストアを直接使用」という原則からわずかに離れる（ただし `useNavigation` は純粋な合成フックでストアではない）

### Option C: useViewStore に複合アクションを追加

`useViewStore` に `goToEdit` 等を追加し、`useMemoDataStore` への参照を内部で持つ。

**トレードオフ**:

- ❌ Zustand ストア間の直接依存が生まれ、ストア独立性が壊れる
- ❌ `useViewStore` の責務（表示状態）を超えた責務混入
- 非推奨

---

## 4. 工数・リスク評価

| 観点       | 評価            | 根拠                                                                                                                      |
| ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **工数**   | **S**（1〜3日） | 移行先は明確。新規 API 設計不要。8ファイルの import 置換 + 1フックの新設                                                  |
| **リスク** | **Low**         | TypeScript コンパイルがリグレッションをガード。既存テストがないため手動確認が必要だが、ロジック変更はなく挙動が変わらない |

---

## 5. 設計フェーズへの推奨事項

### 優先アプローチ

**Option B（`useNavigation` カスタムフック）** を推奨。

- 複合アクションのロジック重複を避けつつ、各コンポーネントは `useMemoStore` という「なんでも入る」ラッパーに依存しなくなる
- プロジェクトの `hooks/` ファイル命名規則・構造に自然に馴染む
- 設計フェーズでの主要決定事項：`useNavigation` が提供するアクション一覧の確定

### 設計フェーズへの持ち越し事項

- `useNavigation` が提供すべき複合アクション一覧の確定（`goToEdit` / `goToList` / `goToMemoCreate` / `goToNotebookCreate` / `goToNotebookEdit` / `goToMemosForNotebook` / `goToTags` / `goToTrash` の8アクション）
- 一部アクション（`goToTags`, `goToTrash`, `goToNotebookCreate` 等）は `useViewStore` 単独でも完結するため、`useNavigation` に含めるか `useViewStore` を直接使うか判断が必要
- 移行順序（ビルドが常に通る状態を維持しながら段階的に移行するか、一括で移行するか）
