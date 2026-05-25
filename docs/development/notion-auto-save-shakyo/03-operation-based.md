# 写経ガイド 案②: Operation ベース（差分のみ送信）への移行

> 想定所要時間: 60〜90分
> 写経対象: `MemoEditor.tsx` + `memo-bridge.ts` + テスト
> ゴール: タイトルだけ変更したら title だけ、本文だけ変更したら content だけサーバーに送る
> 前提: [案③（永続キュー）](./02-persistent-queue.md) 完了済みであること

---

## 0. なぜこの変更をするのか

### 現状

`MemoEditor.tsx:100-115` で `updateMemo.mutate` を呼ぶとき、**変更してないフィールドも全部送ってる**:

```ts
updateMemo.mutate({
	id: memo.id,
	data: {
		title: title.trim() || '無題', // 変えてなくても送る
		content: content.trim(), // 変えてなくても送る
		notebookId: selectedNotebookId || null, // 変えてなくても送る
	},
});
```

### Notion 流に変えるとどうなる

Notion は編集を **「単一レコードを作成 or 更新する Operation」** に分解する。
Mosaku 版に翻訳すると：

```ts
// タイトルだけ変えたとき
{ patch: { title: '新タイトル' } }

// 本文とノートブックを変えたとき
{ patch: { content: '...', notebookId: 'xyz' } }

// タイトルを空にしたとき（明示的に削除）
{ patch: { title: '' } }
```

### 嬉しいこと

- **帯域削減**: 100KB の本文を持つメモのタイトルだけ変えるとき 100KB 送らなくて済む
- **競合解決しやすい**: 「title を変えた人」と「content を変えた人」が並列に編集してても merge できる素地ができる
- **意図が明確**: ペイロードを見れば「何が変わったか」一目瞭然
- バックエンドの `UpdateMemoDto` は既に partial 対応済みなので、フロント側の整理だけで OK

### 既存資産

- `backend/src/memo/dto/update-memo.dto.ts` の `title? / content? / notebookId?` は既に `@IsOptional()`
- `PendingOperationPatch`（`frontend/src/utils/offline/db.ts:24`）も既に partial 型
- → **バックエンド変更は不要**

---

## 0.1 事前準備

```bash
git checkout -b feat/frontend-memo-patch-only-changed
cd frontend
npm run test -- src/components/memo/MemoEditor.test.tsx
```

案③が main にマージされてる想定（または同じブランチでスタック作業）。

---

## Step 1: `MemoEditor` で「変更されたフィールドだけ」の patch を作る

**ファイル**: `frontend/src/components/memo/MemoEditor.tsx`

### 1-A: 変更検知の useEffect の真下に、`buildPatch` ヘルパーを追加

#### Before（line 191-204 周辺）

```ts
// 変更検知
useEffect(() => {
	const originalTitle = memo?.title || '';
	const originalContent = memo?.content || '';
	const originalTagIds = memo?.memoTags?.map((mt) => mt.tag.id) || [];
	const originalNotebookId = memo?.notebookId || '';

	const tagsChanged =
		JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
	const notebookChanged = selectedNotebookId !== originalNotebookId;

	setHasChanges(
		title !== originalTitle || content !== originalContent || tagsChanged || notebookChanged,
	);
}, [title, content, selectedTagIds, selectedNotebookId, memo]);
```

#### After

```ts
// 変更検知
useEffect(() => {
	const originalTitle = memo?.title || '';
	const originalContent = memo?.content || '';
	const originalTagIds = memo?.memoTags?.map((mt) => mt.tag.id) || [];
	const originalNotebookId = memo?.notebookId || '';

	const tagsChanged =
		JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
	const notebookChanged = selectedNotebookId !== originalNotebookId;

	setHasChanges(
		title !== originalTitle || content !== originalContent || tagsChanged || notebookChanged,
	);
}, [title, content, selectedTagIds, selectedNotebookId, memo]);

// Patch ビルダー: 変更されたフィールドだけ含むオブジェクトを返す
const buildPatch = useCallback((): UpdateMemoDto => {
	if (!memo) return {};

	const patch: UpdateMemoDto = {};
	const originalTitle = memo.title || '';
	const originalContent = memo.content || '';
	const originalNotebookId = memo.notebookId || '';

	const nextTitle = title.trim() || '無題';
	if (nextTitle !== originalTitle) {
		patch.title = nextTitle;
	}
	if (content.trim() !== originalContent) {
		patch.content = content.trim();
	}
	const nextNotebookId = selectedNotebookId || null;
	if (nextNotebookId !== (memo.notebookId ?? null)) {
		patch.notebookId = nextNotebookId ?? undefined;
	}
	return patch;
}, [memo, title, content, selectedNotebookId]);
```

### 1-B: import に `UpdateMemoDto` を追加

#### Before（line 12 周辺）

```ts
import type { Memo } from '../../types/memo';
```

#### After

```ts
import type { Memo, UpdateMemoDto } from '../../types/memo';
```

### 解説 💡

- `useCallback` は不要かもしれない（毎レンダリング再生成でも実害なし）が、`handleSave` の依存に含めるなら付けた方が React Compiler との相性◎
- `notebookId` だけ `null` を扱うのが特殊 — 明示的に「ノートブックを外す」のと「未変更」を区別したい
  - `patch.notebookId = nextNotebookId ?? undefined` で「外す」を表現（null を送る）
  - 未変更なら `patch.notebookId` 自体が undefined のまま（key が存在しない）

---

## Step 2: `handleSave` で `buildPatch()` を使う

**ファイル**: `frontend/src/components/memo/MemoEditor.tsx`

### 2-A: update のペイロードを patch に差し替える

#### Before（line 99-115）

```ts
if (memo && hasChanges) {
    const outcome = await new Promise<MemoUpdateOutcome>((resolve, reject) => {
        updateMemo.mutate(
            {
                id: memo.id,
                data: {
                    title: title.trim() || '無題',
                    content: content.trim(),
                    notebookId: selectedNotebookId || null,
                },
            },
            {
                onSuccess: resolve,
                onError: reject,
            },
        );
    });
```

#### After

```ts
if (memo && hasChanges) {
    const patch = buildPatch();
    // patch が空（タグだけ変わったケース等）は memo 本体の更新をスキップ
    if (Object.keys(patch).length === 0) {
        // タグ変更だけならここに到達し得る。タグ同期は下のブロックに任せる
        const originalTagIds = memo.memoTags?.map((mt) => mt.tag.id) || [];
        const tagsChanged =
            JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
        if (tagsChanged) {
            assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
        }
        return;
    }
    const outcome = await new Promise<MemoUpdateOutcome>((resolve, reject) => {
        updateMemo.mutate(
            {
                id: memo.id,
                data: patch,
            },
            {
                onSuccess: resolve,
                onError: reject,
            },
        );
    });
```

### 2-B: `handleSave` の依存配列に `buildPatch` を追加

#### Before（line 130-143）

```ts
}, [
    title,
    content,
    selectedTagIds,
    isCreate,
    createMemo,
    memo,
    hasChanges,
    updateMemo,
    assignTags,
    selectedNotebookId,
    setSelectedMemoId,
    setCurrentView,
]);
```

#### After

```ts
}, [
    title,
    content,
    selectedTagIds,
    isCreate,
    createMemo,
    memo,
    hasChanges,
    updateMemo,
    assignTags,
    selectedNotebookId,
    setSelectedMemoId,
    setCurrentView,
    buildPatch,
]);
```

### 解説 💡

- **patch が空のケース**: 「title も content も notebook も変わってないけどタグだけ変わった」状況
  - 案④でタグも 1 コール化したら不要になる分岐
  - 今はタグだけ別 API なので、early return でタグ同期だけ走らせる
- `updateMemo.mutate` に空の data を渡すとバックエンドの `class-validator` は通る（全フィールド optional）が、わざわざ空リクエストを送る意味がないのでスキップ

---

## Step 3: `memo-bridge.ts` の `updateMemo` で `data` をそのまま patch として保持

案③で書いた `operation.patch` がもう partial を期待する形になってる。
**変更不要！**（既に対応済み）

ただし、案③ Step 1-A の After コードの中に以下があった:

```ts
patch: {
    title: data.title,
    content: data.content,
    notebookId: data.notebookId !== undefined ? data.notebookId : undefined,
},
```

ここを **「`data` に明示的に渡されたキーだけ patch に入れる」** ように厳密化する。

### 3-A: patch 構築を「キーの存在で判定」に変える

**ファイル**: `frontend/src/utils/memo/memo-bridge.ts`

#### Before

```ts
const operation: PendingOperationRecord = {
	memoId: id,
	kind: 'update',
	patch: {
		title: data.title,
		content: data.content,
		notebookId: data.notebookId !== undefined ? data.notebookId : undefined,
	},
	clientUpdatedAt,
	enqueuedAt: clientUpdatedAt,
	retryCount: 0,
};
```

#### After

```ts
const patch: PendingOperationPatch = {};
if (data.title !== undefined) patch.title = data.title;
if (data.content !== undefined) patch.content = data.content;
if (data.notebookId !== undefined) patch.notebookId = data.notebookId;

const operation: PendingOperationRecord = {
	memoId: id,
	kind: 'update',
	patch,
	clientUpdatedAt,
	enqueuedAt: clientUpdatedAt,
	retryCount: 0,
};
```

### 3-B: import に `PendingOperationPatch` を追加（line 5）

#### Before

```ts
import type { CachedMemoRecord, PendingOperationRecord } from '../offline/db';
```

#### After

```ts
import type {
	CachedMemoRecord,
	PendingOperationPatch,
	PendingOperationRecord,
} from '../offline/db';
```

### 解説 💡

- `data.title !== undefined` で判定すると「key が来てない」と「key が来てて空文字」を区別できる
- 後者は明示的な「タイトルを空にする」操作なので、patch に含めるべき
- 「JSON で送るときに key 自体が存在しない」状態を作るのがコツ

---

## Step 4: テストを更新

### 4-A: `MemoEditor.test.tsx` で「タイトルだけ変更したら title だけ送られる」を検証

**ファイル**: `frontend/src/components/memo/MemoEditor.test.tsx`

#### After（追加するテスト）

```ts
it('タイトルだけ変更したとき、updateMemo には title フィールドだけ含む patch が送られる', async () => {
	// セットアップは既存テスト準拠
	const updateMemoSpy = vi.fn();
	// ... renderEditor with existing memo

	// タイトルだけ変更
	const titleInput = screen.getByPlaceholderText('タイトル');
	fireEvent.change(titleInput, { target: { value: '新タイトル' } });

	// 自動保存トリガー（200ms 待つ or 手動保存ボタン）
	fireEvent.click(screen.getByText('保存'));

	await waitFor(() => {
		expect(updateMemoSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				data: { title: '新タイトル' }, // ← content も notebookId も含まない
			}),
		);
	});
});
```

### 4-B: `memo-bridge.test.ts` で「patch がそのまま enqueue される」を検証

#### After（追加するテスト）

```ts
it('updateMemo の patch は明示的に渡されたキーのみ含む', async () => {
	await bridge.updateMemo(memoId, { title: '新タイトル' });

	expect(mockRepo.applyOfflineEdit).toHaveBeenCalledWith(
		expect.objectContaining({
			operation: expect.objectContaining({
				patch: { title: '新タイトル' }, // content / notebookId はキー自体が無い
			}),
		}),
	);
});
```

### 解説 💡

- `expect.objectContaining` だと「他のキーがあっても通る」ので、**厳密な比較** が必要なら `expect(...).toEqual({ patch: {...} })` を使う
- Operation 化の本質は「**含まれていないキーは変更しない**」というセマンティクス

---

## Step 5: テストとビルドを通す

```bash
cd frontend
npm run test
npm run lint
npm run build
```

backend は変えてないけど一応:

```bash
cd ../backend
npm run test -- --testPathPattern=memo
```

---

## Step 6: 動作確認（dev server + DevTools）

```bash
npm run dev
```

1. メモを開いて **タイトルだけ** 変更
2. DevTools Network タブで `PATCH /memos/:id` を開く
3. **Request Payload** に `title` だけ含まれてることを確認

```json
{ "title": "新タイトル", "clientUpdatedAt": "2026-05-24T..." }
```

→ `content` も `notebookId` も含まれない。これが Operation ベース🔥

### 比較

- 変更前: `{ title, content, notebookId, clientUpdatedAt }` 全部送ってた
- 変更後: 実際に変更したキー + `clientUpdatedAt` だけ

---

## Step 7: コミット

```bash
git add frontend/src/components/memo/MemoEditor.tsx \
        frontend/src/components/memo/MemoEditor.test.tsx \
        frontend/src/utils/memo/memo-bridge.ts \
        frontend/src/utils/memo/memo-bridge.test.ts
git commit -m "feat(frontend/memo): メモ更新を Operation ベース（変更フィールドのみ）に切替"
```

---

## トラブルシュート

### Q. `patch` が空のはずなのに API 呼ばれる

- `buildPatch` のフィールド比較が正しいか確認
- 特に notebookId は `null` と `''` と `undefined` の扱いに注意
- HTML エディタの `content` は `<p></p>` などの空タグを含むので、本当に「変更なし」を判定する場合は trim + tag strip が必要かも

### Q. タグだけ変えても保存が走らない

- 案④で 1 コール化するまでは、`MemoEditor.tsx` 2-A の `Object.keys(patch).length === 0` 分岐で `assignTags` だけ呼ぶ
- そこに到達してるかブレークポイントで確認

### Q. バックエンドが 400 を返す

- `UpdateMemoDto` の `@MaxLength(100)` に引っかかってないか確認（タイトル）
- `class-validator` は `undefined` を許容するので空 patch でも通るはずだが、空オブジェクトを `{}` で送ると `Body must not be empty` 系のエラーが出るバージョンもある → Step 2-A の early return でそもそも空 patch を送らない設計

---

## 次のステップ

- **案④（メモ更新+タグの 1 トランザクション化）** → [`04-atomic-transaction.md`](./04-atomic-transaction.md)
  - `assignTags` を `UpdateMemoDto` に統合し、`Object.keys(patch).length === 0` 分岐を消す

---

## 参考

- 元レポート: [`docs/development/notion-auto-save-research.md`](../notion-auto-save-research.md)
- 既存型: `frontend/src/utils/offline/db.ts` の `PendingOperationPatch`
- Backend DTO: `backend/src/memo/dto/update-memo.dto.ts`（既に partial 対応済み）
