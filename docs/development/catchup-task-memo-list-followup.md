# キャッチアップ写経タスク フォローアップ: 新規作成ボタン + 戻り導線修正 + 検索フィルター強化

> `catchup-task-memo-list.md` の続編。メモ一覧の基本機能(検索バー・ソート・件数表示)は揃ったので、次は「作成導線」「戻り導線のバグ」「フィルター強化」をまとめて片付ける。

## 背景

`catchup-task-memo-list.md` の Step 1〜4 完了後、ドッグフーディングで以下の摩擦が残っていることが分かった:

- **新規メモ作成ボタンが MemoList に無い**。`Cmd+Opt+N` のショートカットはあるが、初見ユーザーには見えない。`Header.tsx` には `onMemoCreateClick` という未使用 prop が宣言されたまま放置されている
- **ノートブック経由でメモ一覧に入ると「全メモ」に戻れない**。`useViewStore.goToMemoList()` が `notebookFilter` を `'ALL'` にリセットしないため、ヘッダーの「メモ」ボタンを押しても同じ画面に留まる
- **検索バーはタイトル/本文のみ**。タグやノートブックでの絞り込みが MemoList 上から行えない(タグは `useTagStore.selectedTags` 経由で `useMemos` と連動するが、UI が無い)

## 触るファイル

| ファイル                                    | 役割                                        |
| ------------------------------------------- | ------------------------------------------- |
| `frontend/src/components/memo/MemoList.tsx` | 拡張対象                                    |
| `frontend/src/stores/useViewStore.ts`       | `goToMemoList` を修正                       |
| `frontend/src/components/tag/TagFilter.tsx` | 既存。MemoList から呼び出すだけ             |
| `frontend/src/hooks/useNavigation.ts`       | `goToMemoCreate` をそのまま利用             |
| `frontend/src/hooks/useNotebookQueries.ts`  | `useNotebooks` をそのまま利用               |
| `frontend/src/stores/useTagStore.ts`        | `selectedTags` / `clearSelectedTags` を参照 |

## 進め方

- 1 Step = 1 Commit
- 各ステップ後に動作確認 → `npm run lint && npm run test` → コミット
- Step 1〜2 は新規作成ボタン、Step 3 はバグ修正、Step 4〜6 はフィルター強化
- **Step 3 のバグ修正だけ先にやっても OK**(1 行追加するだけ)

---

## Step 1: MemoList のタイトル行に「+ 新規メモ」ボタンを追加

- [ ] **ゴール**: メモ一覧のタイトル行右側に「+ 新規メモ」ボタンを置く。クリックで `goToMemoCreate()` 発火。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**1-A. import に `Plus` アイコンを追加**

```tsx
import { Search, Plus } from 'lucide-react';
```

**1-B. `useNavigation` から `goToMemoCreate` も取得**

```tsx
const { goToEdit, goToMemoCreate } = useNavigation();
```

**1-C. タイトル行を更新(行 93-96 付近)**

旧:

```tsx
<div className="mb-4 flex items-baseline justify-between">
	<h1 className="text-xl font-semibold text-gray-900">{headerLabel}</h1>
	<span className="text-sm text-gray-500">{sortedMemos.length} 件</span>
</div>
```

新:

```tsx
<div className="mb-4 flex items-baseline justify-between">
	<div className="flex items-baseline gap-3">
		<h1 className="text-xl font-semibold text-gray-900">{headerLabel}</h1>
		<span className="text-sm text-gray-500">{sortedMemos.length} 件</span>
	</div>
	<button
		onClick={goToMemoCreate}
		className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1 transition-colors"
	>
		<Plus className="w-4 h-4" /> 新規メモ
	</button>
</div>
```

> 縦スペースを増やさず、既存の余白を活用するのがポイント。

### 動作確認

- [ ] `cd frontend && npm run dev`
- [ ] メモ一覧画面 → 右上に「+ 新規メモ」ボタンが見える
- [ ] クリック → メモ新規作成画面(`MemoEditor isCreate`)に遷移
- [ ] `Cmd+Opt+N` も従来通り効く

### コミット

```
feat(frontend/memo): メモ一覧に新規作成ボタンを追加
```

---

## Step 2: 空状態にも作成 CTA を追加(任意)

- [ ] **ゴール**: メモ 0 件のときも「最初のメモを作成」ボタンを表示。オンボーディング体験を改善。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**2-A. 空状態の return を置き換え(行 73-81 付近)**

```tsx
if (filteredMemos.length === 0) {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-center text-gray-500">
				<div className="mb-3">
					{isSearching ? '該当するメモが見つかりません' : 'メモがありません'}
				</div>
				{!isSearching && (
					<button
						onClick={goToMemoCreate}
						className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5"
					>
						<Plus className="w-4 h-4" /> 最初のメモを作成
					</button>
				)}
			</div>
		</div>
	);
}
```

> 検索中は CTA を出さない(検索結果ゼロのときに「作成」させても文脈ズレるため)。

### 動作確認

- [ ] 全メモを削除 → 「メモがありません」+ CTAボタン表示
- [ ] CTA クリック → 新規作成画面
- [ ] 検索で 0 件のとき → CTA は出ない

### コミット

```
feat(frontend/memo): メモ一覧の空状態に作成 CTA を追加
```

---

## Step 3: `goToMemoList()` で notebookFilter を ALL にリセット(バグ修正)

- [ ] **ゴール**: どこから「メモ」ボタンを押しても必ず「全メモ」が見られる。

### 現状の問題

`useViewStore.ts:55-60` の `goToMemoList()`:

```tsx
goToMemoList: () =>
    set({
        currentObject: 'memo',
        currentView: 'list',
        isEditing: false,
        // ← notebookFilter がリセットされていない
    }),
```

対して `goToMemosForNotebook(filter)` は `notebookFilter` を特定NBにセットする(行 83-89)。
このため一度「ノートブック → 特定NB → メモ一覧」と入ると、ヘッダーの「メモ」ボタンを押しても`notebookFilter` が残ったままで「全メモ」に戻れない。

### 写経対象: `frontend/src/stores/useViewStore.ts`

**3-A. `goToMemoList` を修正(行 55-60)**

```tsx
goToMemoList: () =>
    set({
        currentObject: 'memo',
        currentView: 'list',
        isEditing: false,
        notebookFilter: 'ALL', // ← 追加
    }),
```

### 動作確認

- [ ] ノートブック画面 → 特定NB選択 → メモ一覧へ遷移(タイトルが「ノートブック内のメモ」)
- [ ] ヘッダーの「メモ」ボタンを押す → タイトルが「全メモ」に切り替わる
- [ ] 件数も全メモの数に更新される

### コミット

```
fix(frontend/memo): メモ一覧へ戻る際にノートブックフィルターをリセット
```

---

## Step 4: ノートブックフィルタータブを MemoList に追加

- [ ] **ゴール**: メモ一覧画面から「全メモ / 受信箱 / 特定ノートブック」を切り替えるタブを表示。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**4-A. import 追加**

```tsx
import { useNotebooks } from '../../hooks/useNotebookQueries';
```

**4-B. ストアからセッターを取得**

```tsx
const { notebookFilter, setNotebookFilter } = useViewStore();
const { data: notebooks = [] } = useNotebooks();
```

> 既存の `const { notebookFilter } = useViewStore();` 行は `setNotebookFilter` を追加した形に置き換える。

**4-C. タイトル行の下、検索バーの上にフィルタータブを追加**

```tsx
<div className="mb-3 flex flex-wrap gap-2">
	{(
		[
			{ value: 'ALL', label: '全メモ' },
			{ value: 'INBOX', label: '受信箱' },
			...notebooks.map((n) => ({ value: n.id, label: n.name })),
		] as const
	).map((opt) => (
		<button
			key={opt.value}
			onClick={() => setNotebookFilter(opt.value)}
			className={`px-3 py-1 rounded-full text-sm transition-colors ${
				notebookFilter === opt.value
					? 'bg-blue-500 text-white'
					: 'bg-gray-100 text-gray-700 hover:bg-gray-200'
			}`}
		>
			{opt.label}
		</button>
	))}
</div>
```

> ノートブックが多い場合のスクロール対応は将来検討(`overflow-x-auto` を `flex-nowrap` と組み合わせる等)。

### 動作確認

- [ ] タブを切り替えると `headerLabel` と件数が変わる
- [ ] 「全メモ」タブで全件表示
- [ ] 「受信箱」タブで `notebookId` がないメモのみ
- [ ] 特定NBタブで該当NBのメモのみ
- [ ] アクティブなタブが青背景で強調される

### コミット

```
feat(frontend/memo): メモ一覧にノートブックフィルタータブを追加
```

---

## Step 5: タグフィルター UI を MemoList に追加

- [ ] **ゴール**: 既存の `TagFilter` コンポーネントを MemoList に組み込み、タグでの絞り込みを可能にする。`useMemos` は既に `selectedTags` を見ているのでバックエンド連携は無修正。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**5-A. import 追加**

```tsx
import { TagFilter } from '../tag/TagFilter';
import { useTagStore } from '../../stores/useTagStore';
```

**5-B. selectedTags を参照**

```tsx
const { selectedTags } = useTagStore();
```

**5-C. ノートブックフィルタータブの下に折りたたみ式で追加**

```tsx
<details className="mb-3 border border-gray-200 rounded-lg">
	<summary className="px-3 py-2 text-sm cursor-pointer text-gray-700 hover:bg-gray-50 select-none">
		タグで絞り込み
		{selectedTags.length > 0 && (
			<span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
				{selectedTags.length}
			</span>
		)}
	</summary>
	<div className="p-3 border-t border-gray-200">
		<TagFilter />
	</div>
</details>
```

> `<details>` ネイティブ要素を使うと折りたたみが state レスで実装できる。初期は閉じた状態。

### 動作確認

- [ ] 「タグで絞り込み」展開 → タグ一覧表示
- [ ] タグをクリック → 該当タグ付きのメモだけ表示、件数が変わる
- [ ] 「すべて解除」ボタンで全件に戻る
- [ ] 選択中タグ数がバッジで表示される

### コミット

```
feat(frontend/memo): メモ一覧にタグフィルター UI を追加
```

---

## Step 6: フィルタ一括解除ボタンを追加(任意)

- [ ] **ゴール**: ノートブックフィルタ × タグフィルタ × 検索クエリ を一発リセットする「フィルタ解除」ボタン。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**6-A. アクティブフィルタの判定とリセット関数**

```tsx
const { selectedTags, clearSelectedTags } = useTagStore();

const hasActiveFilter = notebookFilter !== 'ALL' || selectedTags.length > 0 || isSearching;

const resetAllFilters = () => {
	setNotebookFilter('ALL');
	clearSelectedTags();
	setQuery('');
};
```

**6-B. タイトル行の右側(新規メモボタンの隣)に追加**

```tsx
<div className="flex items-center gap-2">
	{hasActiveFilter && (
		<button
			onClick={resetAllFilters}
			className="px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium"
		>
			フィルタ解除
		</button>
	)}
	<button
		onClick={goToMemoCreate}
		className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1 transition-colors"
	>
		<Plus className="w-4 h-4" /> 新規メモ
	</button>
</div>
```

> Step 1 のタイトル行の `<button>` を、この `<div className="flex items-center gap-2">` でラップする形に置き換える。

### 動作確認

- [ ] 何かフィルタを当てる(ノートブックタブ・タグ・検索) → 「フィルタ解除」ボタン出現
- [ ] クリック → 全部リセット & 全件表示に戻る
- [ ] 何もフィルタしてないとき → ボタン非表示

### コミット

```
feat(frontend/memo): MemoList にフィルタ一括解除ボタンを追加
```

---

## 全体検証コマンド

各ステップ後 or 最後にまとめて:

```bash
cd frontend
npm run lint
npm run test
npm run build   # TypeScript 型チェック込み
```

UI 確認:

```bash
cd frontend && npm run dev
# http://localhost:5173 を開いて
# 1. メモ一覧右上の「+ 新規メモ」で作成画面に遷移できる
# 2. メモ 0 件のとき「最初のメモを作成」CTAが出る
# 3. ノートブックから入っても「メモ」ボタンで全メモに戻れる
# 4. ノートブックタブ・タグフィルタが効く
# 5. フィルタ解除ボタンで一括リセット
```

## 写経のコツ

- **Step 3 のバグ修正だけ先にやっても OK**。1 行追加するだけで導線改善できる
- **Step 1 → Step 6 で UI が積み上がる構造**なので、途中でやめても見た目は破綻しない
- **既存パターンを盗む**: フィルタタブの色(`bg-blue-500 text-white`)は新規メモボタンと揃える。タグバッジの `bg-blue-100 text-blue-800` はヘッダーのナビと同じ
- **疲れたら Step 3 までで止めても OK**。新規作成ボタンとバグ修正だけで主要な摩擦は解消する
- **Step 5 のタグフィルター**は `useMemos` 側で既に `selectedTags` 連動済みなので、UI を載せるだけで動く点に注目(React Query キャッシュキーに `selectedTags` が含まれている)
