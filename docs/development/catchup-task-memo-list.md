# キャッチアップ写経タスク: メモ一覧画面の拡張 + ヘッダーに「メモ一覧」ボタン追加

> 久しぶりにコードベースに戻るためのキャッチアップ用写経タスク。Header → useNavigation → useViewStore → React Query という主要な流れを、手を動かして思い出すことが目的。

## 背景

メモ一覧画面は既に `frontend/src/components/memo/MemoList.tsx` として実装済みで、`useViewStore.currentObject === 'memo' && currentView === 'list'` のときに表示される仕組み。ただし以下が未整備:

- ヘッダーには「ノートブック / タグ / ゴミ箱」ボタンしかなく、**他画面から「メモ一覧」へ戻るためのボタンが PC ナビに無い**（左上の「←」は `md:hidden` でモバイル限定）
- `MemoList` は「ローディング / エラー / 空 / 一覧」の最小実装で、**検索バー・ソート・件数表示・空状態の文言分岐などが無い**

## 触るファイル

| ファイル                                    | 役割                                                      |
| ------------------------------------------- | --------------------------------------------------------- |
| `frontend/src/components/ui/Header.tsx`     | ナビボタンを追加                                          |
| `frontend/src/components/memo/MemoList.tsx` | 拡張対象                                                  |
| `frontend/src/components/memo/MemoItem.tsx` | 参考（変更なし想定）                                      |
| `frontend/src/hooks/useNavigation.ts`       | `goToList()` をそのまま利用                               |
| `frontend/src/hooks/useMemoQueries.ts`      | `useMemos` / `useSearchMemos` をそのまま利用              |
| `frontend/src/stores/useViewStore.ts`       | `currentObject` / `currentView` / `notebookFilter` を参照 |

## 進め方

- 1 Step = 1 Commit
- 各ステップ後に動作確認 → `npm run lint && npm run test` → コミット
- Step 1 とそれ以降は独立。Step 2 までやれば最低限のキャッチアップ目標は達成

---

## Step 1: ヘッダーに「メモ一覧」ボタンを追加

- [ ] **ゴール**: 他画面から1クリックでメモ一覧に戻れる。一覧表示中はボタンがアクティブ表示。

### 写経対象: `frontend/src/components/ui/Header.tsx`

**1-A. import に `StickyNote` を追加**

```tsx
// 行 4
import { LibraryBig, StickyNote, Tag, LogOut, Settings, Trash2 } from 'lucide-react';
```

**1-B. ナビボタン群（行 61 付近の `<div className="ml-6 flex items-center space-x-2">` 内）の先頭に追加**

`<button onClick={goToNotebookList}...>` の **直前** に挿入:

```tsx
<button
	onClick={goToList}
	className={`px-3 py-2 rounded text-sm font-medium transition-colors inline-flex items-center ${
		currentObject === 'memo' && currentView === 'list'
			? 'bg-blue-100 text-blue-800'
			: 'text-gray-600 hover:text-gray-900'
	}`}
>
	<StickyNote className="w-4 h-4 mr-1.5" /> メモ一覧
</button>
```

### 動作確認

- [ ] `cd frontend && npm run dev` で起動
- [ ] ノートブック画面 → ヘッダーの「メモ一覧」クリック → メモ一覧に戻る
- [ ] メモ一覧表示中はボタンが青背景になる
- [ ] ゴミ箱画面からも戻れる

### コミット

```
feat(frontend/ui): ヘッダーに「メモ一覧」ナビボタンを追加
```

---

## Step 2: MemoList にタイトルと件数表示を追加

- [ ] **ゴール**: 一覧上部に「全メモ / 受信箱 / ノートブック内のメモ」のタイトルと件数を表示。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**2-A. 一覧表示部分（行 54-64）を以下に置き換え**

```tsx
const headerLabel =
	notebookFilter === 'ALL'
		? '全メモ'
		: notebookFilter === 'INBOX'
			? '受信箱'
			: 'ノートブック内のメモ';

return (
	<div className="flex-1 overflow-y-auto">
		<div className="max-w-4xl mx-auto p-4">
			<div className="mb-4 flex items-baseline justify-between">
				<h1 className="text-xl font-semibold text-gray-900">{headerLabel}</h1>
				<span className="text-sm text-gray-500">{filteredMemos.length} 件</span>
			</div>
			<div className="space-y-2">
				{filteredMemos.map((memo) => (
					<MemoItem key={memo.id} memo={memo} onClick={() => goToEdit(memo)} />
				))}
			</div>
		</div>
	</div>
);
```

### 動作確認

- [ ] 全メモタブ → 「全メモ N 件」
- [ ] 受信箱タブ → 「受信箱 N 件」
- [ ] 特定ノートブック → 「ノートブック内のメモ N 件」

### コミット

```
feat(frontend/memo): メモ一覧にタイトルと件数表示を追加
```

---

## Step 3: MemoList に検索バーを追加

- [ ] **ゴール**: 入力中は `useSearchMemos(query)` の結果を、空のときは `useMemos()` の結果を表示。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**3-A. import を追加**

```tsx
import { useMemo, useState } from 'react';
import { useMemos, useSearchMemos } from '../../hooks/useMemoQueries';
import { Search } from 'lucide-react';
```

**3-B. コンポーネント冒頭で query 状態と検索フックを使用**

```tsx
const [query, setQuery] = useState('');
const trimmedQuery = query.trim();
const isSearching = trimmedQuery.length > 0;

const memosQuery = useMemos();
const searchQuery = useSearchMemos(trimmedQuery);

const activeQuery = isSearching ? searchQuery : memosQuery;
const { data: memos = [], isLoading, error } = activeQuery;
```

> 既存の `const { data: memos = [], isLoading, error } = useMemos();` 行は削除する。

**3-C. 一覧表示の `<h1>` 直下に検索バーを追加**

```tsx
<div className="mb-4 flex items-baseline justify-between">
    <h1 className="text-xl font-semibold text-gray-900">{headerLabel}</h1>
    <span className="text-sm text-gray-500">{filteredMemos.length} 件</span>
</div>
<div className="mb-4 relative">
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
    <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="タイトル・本文で検索..."
        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
</div>
```

**3-D. 空状態の文言を分岐**

```tsx
if (filteredMemos.length === 0) {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-gray-500">
				{isSearching ? '該当するメモが見つかりません' : 'メモがありません'}
			</div>
		</div>
	);
}
```

> 注: 検索中も `notebookFilter` の絞り込みは効くため、`filteredMemos` をそのまま使う。

### 動作確認

- [ ] 入力なし → 通常一覧
- [ ] 「テスト」と入力 → ヒットしたメモだけ表示、件数が変化
- [ ] ヒット 0 件 → 「該当するメモが見つかりません」
- [ ] 入力クリア → 元の一覧に戻る

### コミット

```
feat(frontend/memo): メモ一覧に検索バーを追加
```

---

## Step 4: MemoList にソート機能を追加

- [ ] **ゴール**: 「更新日時 降順（既定） / 更新日時 昇順 / 作成日時 降順 / タイトル昇順」をセレクトで切替。

### 写経対象: `frontend/src/components/memo/MemoList.tsx`

**4-A. ソート種別を型として定義（ファイル先頭）**

```tsx
type SortKey = 'updated_desc' | 'updated_asc' | 'created_desc' | 'title_asc';
```

**4-B. 状態を追加**

```tsx
const [sortKey, setSortKey] = useState<SortKey>('updated_desc');
```

**4-C. `filteredMemos` の `useMemo` の後にソート処理を追加**

```tsx
const sortedMemos = useMemo(() => {
	const list = [...filteredMemos];
	switch (sortKey) {
		case 'updated_desc':
			return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		case 'updated_asc':
			return list.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
		case 'created_desc':
			return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		case 'title_asc':
			return list.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
	}
}, [filteredMemos, sortKey]);
```

> 以降の表示部分は `filteredMemos.map` → `sortedMemos.map` に、件数表示も `sortedMemos.length` に置き換える。

**4-D. 検索バーの隣にセレクトボックスを追加**

```tsx
<div className="mb-4 flex gap-2">
	<div className="relative flex-1">
		<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
		<input
			type="search"
			value={query}
			onChange={(e) => setQuery(e.target.value)}
			placeholder="タイトル・本文で検索..."
			className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
		/>
	</div>
	<select
		value={sortKey}
		onChange={(e) => setSortKey(e.target.value as SortKey)}
		className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
	>
		<option value="updated_desc">更新日時（新しい順）</option>
		<option value="updated_asc">更新日時（古い順）</option>
		<option value="created_desc">作成日時（新しい順）</option>
		<option value="title_asc">タイトル昇順</option>
	</select>
</div>
```

### 動作確認

- [ ] 既定で「更新日時 新しい順」になっている
- [ ] 各オプション切替で並びが変わる
- [ ] 検索中もソートが効く

### コミット

```
feat(frontend/memo): メモ一覧にソート切替セレクトを追加
```

---

## Step 5: MemoList のテストを追加

- [ ] **ゴール**: Vitest + React Testing Library で、ローディング / 空 / 通常 / 検索結果 の4ケースをカバー。

### 写経対象: `frontend/src/components/memo/MemoList.test.tsx`（新規）

参考: `frontend/src/components/editor/RichTextEditor.test.tsx` のラッパーパターンを踏襲。
`useMemos` / `useSearchMemos` を `vi.mock` でモックし、状態を切り替えてレンダリング結果を検証する。

最低限のテストケース:

1. `useMemos` が `isLoading: true` を返すとき「読み込み中...」が表示される
2. `useMemos` が空配列を返すとき「メモがありません」が表示される
3. メモ 2 件を返すとき、両方のタイトルが描画される
4. 検索入力後、`useSearchMemos` の結果が反映され、件数表示が変わる

> `RichTextEditor.test.tsx` の `createWrapper` 関数をコピペしてベースにする。

### 動作確認

```bash
cd frontend
npm run test -- src/components/memo/MemoList.test.tsx
```

### コミット

```
test(frontend/memo): MemoList のレンダリングテストを追加
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
# 1. ヘッダーの「メモ一覧」ボタンが他画面から戻れる
# 2. タイトルと件数が出る
# 3. 検索が効く
# 4. ソート切替で並びが変わる
```

## 写経のコツ

- **コードは見ながら手で打つ**。コピペだと記憶に残らないので Step1 から順に。
- **1 ステップ完了するごとに `npm run dev` で目視確認 → コミット**。失敗したら直前のステップに戻るだけで済む。
- **既存パターンを盗む**: lucide-react のアイコン名、Tailwind の `bg-blue-100 text-blue-800` などのアクティブ色、`flex-1 overflow-y-auto` のレイアウト。新しい命名は作らない。
- **Step 2 までで疲れたら止めても OK**。最低限のキャッチアップ目標は「Header.tsx → useNavigation → useViewStore の流れを思い出す」こと。
