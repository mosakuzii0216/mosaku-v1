# 写経ガイド 案④: メモ更新 + タグ割当を 1 トランザクション化

> 想定所要時間: 90〜120分
> 写経対象: backend (DTO / service) + frontend (memo-bridge / MemoEditor)
> ゴール: `PATCH /memos/:id` 1 回でメモ本体とタグを同時に更新
> 前提: [案③](./02-persistent-queue.md) と [案②](./03-operation-based.md) 完了済み

---

## 0. なぜこの変更をするのか

### 現状の問題

`MemoEditor.tsx:99-129` で、メモ本体の更新とタグの割当が **別 API コール** になってる:

```ts
const outcome = await updateMemo.mutate({ id, data: patch }); // PATCH /memos/:id
// ...
if (outcome.kind === 'synced') {
	if (tagsChanged) {
		assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } }); // 別 API
	}
}
```

これの厄介ポイント:

1. **オフライン時にタグ同期スキップ**: `outcome.kind === 'synced'` のときだけタグ更新するから、オフライン中のタグ変更は失われる
2. **アトミック性なし**: メモ更新は成功したけどタグ更新が失敗、というケースで整合性が崩れる
3. **2 リクエスト分のレイテンシ**: 軽い変更でも往復が2回

### Notion 流のアトミック API

> "Operations are batched into transactions that are committed (or rejected) by the server as a group."

Notion は複数 Operation を **1 トランザクション** にまとめて、サーバーで原子的に commit する。

Mosaku 版に翻訳すると:

```http
PATCH /memos/:id
Content-Type: application/json

{
    "title": "新タイトル",
    "tagIds": ["tag-1", "tag-2"],
    "clientUpdatedAt": "2026-05-24T..."
}
```

→ サーバー側で **同一トランザクション内** で memo と memo_tags を更新する。

---

## 0.1 事前準備

```bash
git checkout -b feat/memo-update-tags-in-single-call
cd backend
npm run test -- --testPathPattern=memo.service
cd ../frontend
npm run test -- src/components/memo/MemoEditor
```

---

## Step 1: バックエンドの `UpdateMemoDto` に `tagIds` を追加

**ファイル**: `backend/src/memo/dto/update-memo.dto.ts`

### 1-A: `tagIds?: string[]` を追加

#### Before

```ts
import { IsString, IsOptional, MaxLength, IsISO8601, Matches } from 'class-validator';

export class UpdateMemoDto {
	@IsString()
	@IsOptional()
	@MaxLength(100)
	title?: string;

	@IsString()
	@IsOptional()
	content?: string;

	@IsString()
	@IsOptional()
	notebookId?: string;

	@IsOptional()
	@IsISO8601({ strict: true })
	@Matches(/(?:Z|[+-]\d{2}:?\d{2})$/, {
		message: 'clientUpdatedAt must include timezone offset (Z or ±HH:MM)',
	})
	clientUpdatedAt?: string;
}
```

#### After

```ts
import {
	IsString,
	IsOptional,
	MaxLength,
	IsISO8601,
	Matches,
	IsArray,
	ArrayMaxSize,
} from 'class-validator';

export class UpdateMemoDto {
	@IsString()
	@IsOptional()
	@MaxLength(100)
	title?: string;

	@IsString()
	@IsOptional()
	content?: string;

	@IsString()
	@IsOptional()
	notebookId?: string;

	/**
	 * 割り当てるタグ ID の完全なリスト（差分ではなく置換）。
	 * undefined なら変更しない。空配列なら全タグを外す。
	 */
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	tagIds?: string[];

	@IsOptional()
	@IsISO8601({ strict: true })
	@Matches(/(?:Z|[+-]\d{2}:?\d{2})$/, {
		message: 'clientUpdatedAt must include timezone offset (Z or ±HH:MM)',
	})
	clientUpdatedAt?: string;
}
```

### 解説 💡

- **「置換」セマンティクス**にする: `tagIds: ["a"]` を送ったら他のタグは全部外れる
- 「差分」（追加/削除）にしたい誘惑があるけど、複雑になるし冪等性も落ちる
- `@ArrayMaxSize(100)` は妥当な上限（業務メモで100タグはあり得ない）
- `undefined` なら変更しない、`[]` なら全タグを外す、の区別が重要

---

## Step 2: `UpdateMemoDto` のテストを追加

**ファイル**: `backend/src/memo/dto/update-memo.dto.spec.ts`

#### After（追加するテスト）

```ts
describe('tagIds field', () => {
	it('tagIds が文字列配列なら通る', async () => {
		const dto = plainToInstance(UpdateMemoDto, {
			tagIds: ['tag-1', 'tag-2'],
		});
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('tagIds が空配列でも通る（全タグを外す意味）', async () => {
		const dto = plainToInstance(UpdateMemoDto, { tagIds: [] });
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('tagIds が省略されても通る', async () => {
		const dto = plainToInstance(UpdateMemoDto, { title: 'x' });
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('tagIds に非文字列が含まれていたら失敗', async () => {
		const dto = plainToInstance(UpdateMemoDto, {
			tagIds: ['tag-1', 123 as unknown as string],
		});
		const errors = await validate(dto);
		expect(errors.length).toBeGreaterThan(0);
	});
});
```

### 解説 💡

- 既存のテストファイルに `describe` をネストするだけ
- `validate()` の使い方は既存テストを参考に
- `as unknown as string` は TS をだますための型キャスト

---

## Step 3: `MemoService.update` で tagIds を扱う

**ファイル**: `backend/src/memo/memo.service.ts`

### 3-A: `update()` 内で `prisma.$transaction` を使って memo と tags を同時に更新

実装イメージ（既存の `update` メソッドの該当箇所を確認の上、写経）:

#### After（参考実装）

```ts
async update(id: string, dto: UpdateMemoDto, userId: string) {
    await this.authorizationService.checkOwnership(/* memo, userId */);

    return this.prisma.$transaction(async (tx) => {
        // 1. メモ本体を更新
        const updated = await tx.memo.update({
            where: { id },
            data: {
                ...(dto.title !== undefined ? { title: dto.title } : {}),
                ...(dto.content !== undefined ? { content: dto.content } : {}),
                ...(dto.notebookId !== undefined ? { notebookId: dto.notebookId } : {}),
                // clientUpdatedAt の LWW 処理は既存ロジックを維持
            },
            include: { memoTags: { include: { tag: true } } },
        });

        // 2. tagIds が指定されてたらタグ割当を置換
        if (dto.tagIds !== undefined) {
            await tx.memoTag.deleteMany({ where: { memoId: id } });
            if (dto.tagIds.length > 0) {
                await tx.memoTag.createMany({
                    data: dto.tagIds.map((tagId) => ({ memoId: id, tagId })),
                });
            }
            // memoTags を含む最新形を返すため再 fetch
            return tx.memo.findUniqueOrThrow({
                where: { id },
                include: { memoTags: { include: { tag: true } } },
            });
        }

        return updated;
    });
}
```

### 解説 💡

- **`$transaction` の中で deleteMany → createMany** が「置換」を表現する素直な書き方
- `tagIds !== undefined` の判定: undefined なら何もしない、`[]` なら全削除
- 既存の `update` メソッドの構造（LWW 判定など）を壊さないよう、既存コードと混ぜる際は要注意
- `AuthorizationService.checkOwnership` は CLAUDE.md の不変則（変えない）

### 3-B: 既存テスト `memo.service.spec.ts` で tag 更新を検証する新規テストを追加

#### After

```ts
it('update に tagIds を渡すとメモのタグが置換される', async () => {
	// 1. メモにタグA, Bを割当て
	// 2. service.update(id, { tagIds: ['C'] }, userId) を呼ぶ
	// 3. メモのタグが C だけになることを assert
	// （詳細は既存テストパターンに準拠）
});

it('update に tagIds: [] を渡すとメモのタグが全部外れる', async () => {
	// 既存タグありの状態から空配列を渡して全削除を検証
});

it('update に tagIds が undefined ならタグは変更されない', async () => {
	// tagIds を渡さず title だけ更新 → タグはそのまま
});
```

---

## Step 4: フロントエンドの型を更新

**ファイル**: `frontend/src/types/memo.ts`

### 4-A: `UpdateMemoDto` に `tagIds?: string[]` を追加

既存の型定義を確認して、`tagIds?: string[]` を生やす（既にあるかも）。

#### Before（typical）

```ts
export interface UpdateMemoDto {
	title?: string;
	content?: string;
	notebookId?: string | null;
	clientUpdatedAt?: string;
}
```

#### After

```ts
export interface UpdateMemoDto {
	title?: string;
	content?: string;
	notebookId?: string | null;
	/** 完全なタグ ID リスト（置換セマンティクス）。undefined なら変更しない */
	tagIds?: string[];
	clientUpdatedAt?: string;
}
```

### 解説 💡

- frontend の型は backend DTO と独立だが、API contract として揃える必要がある
- `tagIds` を `PendingOperationPatch` にも追加するか検討（→ Step 6）

---

## Step 5: `MemoEditor.tsx` で tagIds を patch に含める

**ファイル**: `frontend/src/components/memo/MemoEditor.tsx`

### 5-A: `buildPatch` を tagIds 対応に拡張

#### Before（案②で書いた版）

```ts
const buildPatch = useCallback((): UpdateMemoDto => {
	if (!memo) return {};

	const patch: UpdateMemoDto = {};
	const originalTitle = memo.title || '';
	const originalContent = memo.content || '';
	const originalNotebookId = memo.notebookId || '';

	const nextTitle = title.trim() || '無題';
	if (nextTitle !== originalTitle) patch.title = nextTitle;
	if (content.trim() !== originalContent) patch.content = content.trim();
	const nextNotebookId = selectedNotebookId || null;
	if (nextNotebookId !== (memo.notebookId ?? null)) {
		patch.notebookId = nextNotebookId ?? undefined;
	}
	return patch;
}, [memo, title, content, selectedNotebookId]);
```

#### After

```ts
const buildPatch = useCallback((): UpdateMemoDto => {
	if (!memo) return {};

	const patch: UpdateMemoDto = {};
	const originalTitle = memo.title || '';
	const originalContent = memo.content || '';
	const originalTagIds = (memo.memoTags?.map((mt) => mt.tag.id) ?? []).sort();
	const sortedSelected = [...selectedTagIds].sort();

	const nextTitle = title.trim() || '無題';
	if (nextTitle !== originalTitle) patch.title = nextTitle;
	if (content.trim() !== originalContent) patch.content = content.trim();
	const nextNotebookId = selectedNotebookId || null;
	if (nextNotebookId !== (memo.notebookId ?? null)) {
		patch.notebookId = nextNotebookId ?? undefined;
	}
	if (JSON.stringify(sortedSelected) !== JSON.stringify(originalTagIds)) {
		patch.tagIds = selectedTagIds;
	}
	return patch;
}, [memo, title, content, selectedNotebookId, selectedTagIds]);
```

### 5-B: `assignTags` 呼び出しを削除

#### Before（line 89-91, 117-125 周辺）

```ts
// 新規作成時
if (selectedTagIds.length > 0) {
	assignTags({ memoId: result.id, data: { tagIds: selectedTagIds } });
}

// 更新時
if (outcome.kind === 'synced') {
	const originalTagIds = memo.memoTags?.map((mt) => mt.tag.id) || [];
	const tagsChanged =
		JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
	if (tagsChanged) {
		assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
	}
	return;
}
return outcome.signal;
```

#### After

```ts
// 新規作成時: タグは create 時点では別 API のまま（CreateMemoDto に tagIds を入れるのは別 PR）
if (selectedTagIds.length > 0) {
	assignTags({ memoId: result.id, data: { tagIds: selectedTagIds } });
}

// 更新時: tagIds は patch に含まれてるのでこの分岐は不要
if (outcome.kind === 'synced') {
	return;
}
return outcome.signal;
```

### 5-C: 案② の「patch が空でタグだけ変わった」分岐を削除

#### Before（案② Step 2-A で書いた早期 return）

```ts
const patch = buildPatch();
if (Object.keys(patch).length === 0) {
	const originalTagIds = memo.memoTags?.map((mt) => mt.tag.id) || [];
	const tagsChanged =
		JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
	if (tagsChanged) {
		assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
	}
	return;
}
```

#### After

```ts
const patch = buildPatch();
// タグも patch に含まれるので、patch が空 = 本当に何も変わってない
if (Object.keys(patch).length === 0) return;
```

### 解説 💡

- 案②で残してた「タグだけ変わったケース」の早期 return が、ここで綺麗に消える ✨
- 新規作成（create）のタグ割当は今回のスコープ外（別 PR で `CreateMemoDto` も対応）

---

## Step 6: `memo-bridge.ts` を tagIds 対応に

**ファイル**: `frontend/src/utils/memo/memo-bridge.ts`

### 6-A: `updateMemo` の record 生成と patch に tagIds を含める

#### Before（案③ + 案② の状態）

```ts
const record: CachedMemoRecord = {
	// ...
	tagIds: existing?.tagIds ?? [],
	// ...
};

const patch: PendingOperationPatch = {};
if (data.title !== undefined) patch.title = data.title;
if (data.content !== undefined) patch.content = data.content;
if (data.notebookId !== undefined) patch.notebookId = data.notebookId;
```

#### After

```ts
const record: CachedMemoRecord = {
	// ...
	tagIds: data.tagIds ?? existing?.tagIds ?? [],
	// ...
};

const patch: PendingOperationPatch = {};
if (data.title !== undefined) patch.title = data.title;
if (data.content !== undefined) patch.content = data.content;
if (data.notebookId !== undefined) patch.notebookId = data.notebookId;
if (data.tagIds !== undefined) patch.tagIds = data.tagIds;
```

### 6-B: `PendingOperationPatch` 型に `tagIds` を追加

**ファイル**: `frontend/src/utils/offline/db.ts`

#### Before

```ts
export interface PendingOperationPatch {
	title?: string;
	content?: string;
	notebookId?: string | null;
}
```

#### After

```ts
export interface PendingOperationPatch {
	title?: string;
	content?: string;
	notebookId?: string | null;
	tagIds?: string[];
}
```

### 6-C: IndexedDB スキーマのバージョン管理

`OFFLINE_DB_VERSION` を上げる必要は **基本ない**（PendingOperationPatch は IndexedDB に直接マッピングされるオブジェクト型で、追加フィールドは後方互換）。

ただし、心配なら `OFFLINE_DB_VERSION = 2` に上げて upgrade 関数を no-op で書いておくと将来安心。

### 解説 💡

- IndexedDB は **スキーマレス**（インデックスだけ定義）なので、フィールド追加は自動で通る
- ただしバージョン番号を上げると `upgrade()` が走るので、勝手に上げないこと
- 過去の `pending_operations` レコードに `tagIds` が無くても、`patch?.tagIds === undefined` として正しく扱われる

---

## Step 7: SyncEngine の `invokeApi` で tagIds を含める

**ファイル**: `frontend/src/utils/sync/sync-engine.ts`

### 7-A: 既存の `invokeApi` を確認

#### Before（line 85-96）

```ts
const invokeApi = (op: PendingOperationRecord): Promise<ServerMemoSnapshot> => {
	if (op.kind === 'update') {
		return api.updateMemo(op.memoId, {
			...(op.patch ?? {}),
			clientUpdatedAt: op.clientUpdatedAt,
		});
	}
	// ...
};
```

#### After

**変更不要！** spread 演算子で `op.patch` を全部展開してるから、`tagIds` も自動で乗る ✨

### 7-B: `MemoSyncApi.updateMemo` の型定義に `tagIds` を追加

**ファイル**: `frontend/src/utils/sync/types.ts`（or 該当の型定義場所）

該当する型を grep して、`updateMemo` の引数型に `tagIds?: string[]` を追加。

### 解説 💡

- SyncEngine 本体のロジックは変えなくていい設計になってる
- 型の整合性だけ保てば OK

---

## Step 8: テストとビルドを通す

```bash
# backend
cd backend
npm run test -- --testPathPattern=memo

# frontend
cd ../frontend
npm run test
npm run lint
npm run build
```

E2E もあれば:

```bash
cd frontend
npm run test:e2e -- --grep memo
```

---

## Step 9: 動作確認（dev server + DevTools）

```bash
npm run dev
```

1. メモを開いて **タイトルとタグを同時に** 変更
2. DevTools Network タブで `PATCH /memos/:id` を確認
3. Request Payload に **`title` + `tagIds`** が両方含まれてることを確認
4. **`POST /tags/.../assign`** などの別 API コールが**発生してない**ことを確認

```json
{
	"title": "新タイトル",
	"tagIds": ["tag-1", "tag-2"],
	"clientUpdatedAt": "2026-05-24T..."
}
```

### オフライン同期も確認

1. DevTools で Offline モードに
2. メモのタグを変更
3. IndexedDB の `pending_operations` を確認 → `patch.tagIds` が入ってる
4. オンラインに戻す → SyncEngine が drain → タグがサーバーにも反映

---

## Step 10: コミット

```bash
git add backend/src/memo/dto/update-memo.dto.ts \
        backend/src/memo/dto/update-memo.dto.spec.ts \
        backend/src/memo/memo.service.ts \
        backend/src/memo/memo.service.spec.ts \
        frontend/src/types/memo.ts \
        frontend/src/components/memo/MemoEditor.tsx \
        frontend/src/utils/memo/memo-bridge.ts \
        frontend/src/utils/offline/db.ts \
        frontend/src/utils/sync/types.ts

git commit -m "feat(backend/memo,frontend/memo): メモ更新とタグ割当を 1 トランザクション化"
```

---

## トラブルシュート

### Q. `prisma.$transaction` でエラー

- `tx.memoTag.createMany` に渡す `data` が空配列だと Prisma バージョンによっては失敗する → `if (dto.tagIds.length > 0)` ガードが必須
- `$transaction` 内で `findUniqueOrThrow` を使うと「該当なし」で例外 → ガード必要

### Q. オフライン中にタグだけ変えたらどうなる？

- `patch.tagIds` だけ含む operation が IndexedDB に積まれる
- SyncEngine が drain 時に `api.updateMemo(id, { tagIds, clientUpdatedAt })` を呼ぶ
- バックエンドは `tagIds` だけある patch を受けてタグだけ更新 → ✨

### Q. 大量のタグを持つメモで重い

- `ArrayMaxSize(100)` を設定してあるので 100 個まで
- 100 個でも `deleteMany` + `createMany` は数ミリ秒
- 気になれば「差分（add/remove）」モードへの拡張も検討（別 PR）

### Q. 既存の `assignTags` を呼ぶ箇所はどうする？

- 新規作成（`createMemo`）の後で呼んでる箇所は残す（今回のスコープ外）
- 別の場所（タグ管理画面など）で呼んでるなら、それぞれの責務に応じて残す/移行を判断

---

## まとめ: 案①〜④を通して得たもの

| 案  | 完了で得るもの                            |
| --- | ----------------------------------------- |
| ①   | デバウンス短縮（体感速度↑）               |
| ③   | 永続キュー統一（耐障害性↑）               |
| ②   | Operation ベース（帯域↓、競合解決の素地） |
| ④   | アトミック更新（整合性↑、レイテンシ↓）    |

Notion 流の **「永続キュー + Operation」** モデルの肝はここまでで揃う🔥

### 次に進むなら

- 案⑤: version history を非同期化（保存レイテンシ改善）
- 案⑥: WebSocket push 同期（マルチデバイス対応）
- 案⑦: CRDT 導入（共同編集向け、要件次第）

---

## 参考

- 元レポート: [`docs/development/notion-auto-save-research.md`](../notion-auto-save-research.md)
- Prisma `$transaction`: [Prisma Docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- Notion 公式: [Exploring Notion's Data Model](https://www.notion.com/blog/data-model-behind-notion)
