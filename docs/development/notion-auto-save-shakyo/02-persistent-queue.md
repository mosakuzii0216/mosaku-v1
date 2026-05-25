# 写経ガイド 案③: オンライン編集も IndexedDB 永続キューを通す

> 想定所要時間: 60〜90分
> 写経対象: `frontend/src/utils/memo/memo-bridge.ts` + テスト
> ゴール: オンライン編集も「IndexedDB に enqueue → 即送信 → 成功で dequeue」フローに統一し、Notion の TransactionQueue モデルに近づける

---

## 0. なぜこの変更をするのか

### 現状

Mosaku は既に **オフライン用** には立派な永続キューを持ってる：

- `frontend/src/utils/offline/db.ts` の `pending_operations` テーブル
- `frontend/src/utils/sync/sync-engine.ts` の SyncEngine（drain・LWW・leader election 完備）
- `frontend/src/utils/offline/repository.ts` の `applyOfflineEdit` / `listPending` / `removePending`

ところが `memo-bridge.ts:121-130` を見ると、**オンライン時は API 直叩き** で IndexedDB を経由しない:

```ts
if (this.isOnline()) {
	try {
		const memo = await this.api.updateMemo(id, { ...data, clientUpdatedAt });
		// ↑ 失敗したら何も残らない
		await this.repo.markSynced(memoToSnapshot(memo));
		await this.repo.removePending(id, 'update');
		return { kind: 'synced', memo };
	} catch (err) {
		if (!this.isLikelyNetworkError(err)) throw err;
	}
}
// ↓ ネットワークエラー時のみここに来る
```

### Notion 流に変えるとどうなる

> "Usually, TransactionQueue sits empty, so the transaction to create the block is sent to Notion's server right away in an API request."

Notion は**常に**キューを通す。空ならスルーパスで即送信、混んでたら積む。
これを Mosaku に適用すると：

1. **enqueue first**: どんな編集でも先に IndexedDB に書く
2. **try send**: オンラインなら即 API に送る
3. **success → dequeue**: 成功すれば IndexedDB から消す
4. **failure / offline → SyncEngine が drain**: 失敗しても永続化されてる

### 何が嬉しい？

- **タブを閉じても保存中の変更が消えない**（送信途中でクラッシュしても OK）
- **オンライン/オフラインの分岐が消えてシンプル**（バグの温床が減る）
- 案②（Operation 化）の前提インフラになる

---

## 0.1 事前準備

```bash
git checkout -b feat/frontend-online-edits-via-queue
cd frontend
npm run test -- src/utils/memo/memo-bridge.test.ts
# 現状の memo-bridge テストが全部 green であることを確認
```

---

## Step 1: `memo-bridge.ts` の `updateMemo` を書き換える

**ファイル**: `frontend/src/utils/memo/memo-bridge.ts`

### 1-A: オンラインパスを「enqueue → 送信 → 成功で remove」に変更（line 117〜159）

#### Before

```ts
async updateMemo(id: string, data: UpdateMemoDto): Promise<MemoUpdateOutcome> {
    const existing = await this.repo.getMemo(id);
    const clientUpdatedAt = this.now().toISOString();

    if (this.isOnline()) {
        try {
            const memo = await this.api.updateMemo(id, { ...data, clientUpdatedAt });
            await this.repo.markSynced(memoToSnapshot(memo));
            await this.repo.removePending(id, 'update');
            return { kind: 'synced', memo };
        } catch (err) {
            if (!this.isLikelyNetworkError(err)) throw err;
        }
    }

    const record: CachedMemoRecord = { /* オフライン保存用 */ };
    const operation: PendingOperationRecord = { /* オフライン保存用 */ };
    await this.repo.applyOfflineEdit({ memo: record, operation });
    return { kind: 'offline-saved', memo: cachedToMemo(record), signal: OFFLINE_SAVED_SIGNAL };
}
```

#### After

```ts
async updateMemo(id: string, data: UpdateMemoDto): Promise<MemoUpdateOutcome> {
    const existing = await this.repo.getMemo(id);
    const clientUpdatedAt = this.now().toISOString();

    // 1. 必ず先にローカルに enqueue（永続化保証）
    const record: CachedMemoRecord = {
        id,
        userId: existing?.userId ?? this.requireUserIdFromRecord(existing),
        title: data.title ?? existing?.title ?? '',
        content: data.content ?? existing?.content ?? '',
        searchableText: stripTagsForSearch(data.content ?? existing?.content ?? ''),
        tagIds: existing?.tagIds ?? [],
        notebookId: data.notebookId !== undefined ? data.notebookId : (existing?.notebookId ?? null),
        createdAt: existing?.createdAt ?? clientUpdatedAt,
        updatedAt: clientUpdatedAt,
        trashedAt: existing?.trashedAt ?? null,
        syncStatus: 'offline-saved', // 後で synced に上書きする
    };
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
    await this.repo.applyOfflineEdit({ memo: record, operation });

    // 2. オフラインなら enqueue で終了
    if (!this.isOnline()) {
        return {
            kind: 'offline-saved',
            memo: cachedToMemo(record),
            signal: OFFLINE_SAVED_SIGNAL,
        };
    }

    // 3. オンラインなら即送信を試みる（失敗しても SyncEngine が後で drain）
    try {
        const memo = await this.api.updateMemo(id, { ...data, clientUpdatedAt });
        await this.repo.markSynced(memoToSnapshot(memo));
        await this.repo.removePending(id, 'update');
        return { kind: 'synced', memo };
    } catch (err) {
        if (this.isLikelyNetworkError(err)) {
            // ネットワーク失敗：キューに残したまま offline-saved として扱う
            return {
                kind: 'offline-saved',
                memo: cachedToMemo(record),
                signal: OFFLINE_SAVED_SIGNAL,
            };
        }
        // ネットワーク以外（400, 403 など）はキューから外して上に投げる
        await this.repo.removePending(id, 'update');
        throw err;
    }
}
```

### 解説 💡

#### 3つの分岐に整理された

| 状況                          | 結果            | キュー                      |
| ----------------------------- | --------------- | --------------------------- |
| オフライン                    | `offline-saved` | 残る（SyncEngine が drain） |
| オンライン + 送信成功         | `synced`        | 消える                      |
| オンライン + ネットワーク失敗 | `offline-saved` | 残る（SyncEngine が drain） |
| オンライン + 4xx/5xx 等       | `throw`         | **消す**（永続化しない）    |

#### なぜ最後の分岐だけ remove するか

- 400 (バリデーションエラー) / 403 (権限) / 500 (サーバーエラー) は **何度リトライしても通らない可能性が高い**
- キューに残すと永遠にリトライされてユーザーが詰む
- ネットワーク失敗 ≠ サーバー側で拒否、を区別するのが鍵

#### `isLikelyNetworkError` をそのまま使う

- 既存ロジック（line 289-296）でネットワークエラーを判定してる
- 「Failed to fetch」「ネットワークエラー」「NetworkError」のいずれかを含む文字列

---

## Step 2: 送信成功時に SyncEngine へ通知（オプション・推奨）

オンライン送信が成功したら SyncEngine の `pendingCount` を更新したい。
これは `memo-bridge` が SyncEngine を知らない設計なので、**呼び出し側**でフックする。

### 2-A: `MemoBridge` のオプションに通知関数を追加

#### Before

```ts
export interface MemoBridgeOptions {
	repository?: OfflineMemoRepository;
	api?: ApiClientLike;
	isOnline?: () => boolean;
	now?: () => Date;
}
```

#### After

```ts
export interface MemoBridgeOptions {
	repository?: OfflineMemoRepository;
	api?: ApiClientLike;
	isOnline?: () => boolean;
	now?: () => Date;
	/** enqueue / dequeue 後に SyncEngine 等へ通知するコールバック（任意） */
	onPendingChanged?: () => void | Promise<void>;
}
```

### 2-B: フィールドとコンストラクタに追加

#### Before

```ts
private readonly isOnline: () => boolean;
private readonly now: () => Date;

constructor(opts: MemoBridgeOptions) {
    // ...
    this.isOnline = opts.isOnline ?? (() => true);
    this.now = opts.now ?? (() => new Date());
}
```

#### After

```ts
private readonly isOnline: () => boolean;
private readonly now: () => Date;
private readonly onPendingChanged: () => void | Promise<void>;

constructor(opts: MemoBridgeOptions) {
    // ...
    this.isOnline = opts.isOnline ?? (() => true);
    this.now = opts.now ?? (() => new Date());
    this.onPendingChanged = opts.onPendingChanged ?? (() => {});
}
```

### 2-C: enqueue / dequeue の直後に通知

`updateMemo` 内の以下 3 箇所で `await this.onPendingChanged();` を呼ぶ:

1. `await this.repo.applyOfflineEdit({ memo: record, operation });` の直後
2. `await this.repo.removePending(id, 'update');`（成功時）の直後
3. `await this.repo.removePending(id, 'update');`（4xx 失敗時）の直後

### 解説 💡

- SyncEngine の `notifyEnqueueChanged()` をここから呼べば、UI の「保存待ち N 件」表示が即時更新される
- まだ UI 側を作ってないなら呼び出し側で no-op 渡してもいい
- 配線は `memo-bridge-instance.ts` か `useAppInit.ts` あたりで（後述）

---

## Step 3: テストを更新

**ファイル**: `frontend/src/utils/memo/memo-bridge.test.ts`

### 3-A: 「オンライン更新でも IndexedDB にレコードが残らない」を検証する既存テストの修正

オンラインでも一旦 enqueue するから、「成功後はキューが空」を確認する形に変える。

#### Before（既存の想定挙動）

```ts
it('オンライン更新は API を呼んで synced を返す', async () => {
	// ...
	const result = await bridge.updateMemo(memoId, { content: '更新' });
	expect(result.kind).toBe('synced');
	expect(mockRepo.applyOfflineEdit).not.toHaveBeenCalled(); // ← 変わる
});
```

#### After

```ts
it('オンライン更新は IndexedDB に enqueue した後 API を呼んで synced を返す', async () => {
	// ...
	const result = await bridge.updateMemo(memoId, { content: '更新' });
	expect(result.kind).toBe('synced');
	expect(mockRepo.applyOfflineEdit).toHaveBeenCalledTimes(1); // enqueue した
	expect(mockRepo.removePending).toHaveBeenCalledWith(memoId, 'update'); // 成功で消した
});
```

### 3-B: 新規テスト「ネットワーク失敗時はキューに残す」

#### After（追加するコード）

```ts
it('オンラインで送信中にネットワーク失敗するとキューに残して offline-saved を返す', async () => {
	mockApi.updateMemo.mockRejectedValueOnce(new Error('Failed to fetch'));

	const result = await bridge.updateMemo(memoId, { content: '更新' });

	expect(result.kind).toBe('offline-saved');
	expect(mockRepo.applyOfflineEdit).toHaveBeenCalledTimes(1);
	expect(mockRepo.removePending).not.toHaveBeenCalled(); // キューに残す
});
```

### 3-C: 新規テスト「4xx エラーはキューから外して throw する」

#### After（追加するコード）

```ts
it('オンラインで 400 系エラーが起きたらキューから消して例外を投げる', async () => {
	const apiError = new Error('Bad Request');
	mockApi.updateMemo.mockRejectedValueOnce(apiError);

	await expect(bridge.updateMemo(memoId, { content: '更新' })).rejects.toThrow(apiError);
	expect(mockRepo.removePending).toHaveBeenCalledWith(memoId, 'update');
});
```

### 解説 💡

- 「送信前に enqueue する」が新しい不変則。これを保証するテストを書いておくと安心
- ネットワーク失敗の判定（`isLikelyNetworkError`）は既存の文字列マッチに依存してるので、テストでも `Failed to fetch` を使う

---

## Step 4: 配線（memo-bridge-instance）— 任意

**ファイル**: `frontend/src/utils/memo/memo-bridge-instance.ts`

SyncEngine と接続するなら、`memo-bridge-instance.ts` の `MemoBridge` 生成時に `onPendingChanged` を渡す。

```ts
// 例（実際のファイル構造に合わせて調整）
new MemoBridge({
	repository,
	api,
	isOnline,
	onPendingChanged: () => syncEngine.notifyEnqueueChanged(),
});
```

### 解説 💡

- SyncEngine のインスタンスは `useAppInit.ts` で生成されてるので、そこの依存関係を整理する必要がある
- 初回は no-op (`() => {}`) で渡しておいて、後の PR で配線するのもアリ

---

## Step 5: テストとビルドを通す

```bash
cd frontend
npm run test -- src/utils/memo/memo-bridge.test.ts
npm run test -- src/utils/sync/  # SyncEngine 周りも壊してないか
npm run lint
npm run build
```

---

## Step 6: 動作確認（dev server + DevTools）

```bash
npm run dev
```

ブラウザで:

1. メモを編集 → 入力停止
2. **Chrome DevTools → Application → IndexedDB → mosaku-offline → pending_operations** を開く
3. 一瞬「該当レコードが現れる → すぐ消える」のが見えるはず（成功時）

### 意図的に失敗させる確認

1. DevTools → Network タブで Throttling を **Offline** に
2. メモを編集
3. **pending_operations に残る** のを確認
4. Throttling を Online に戻す
5. SyncEngine が走って **pending_operations が空になる** のを確認

---

## Step 7: コミット

```bash
git add frontend/src/utils/memo/memo-bridge.ts frontend/src/utils/memo/memo-bridge.test.ts
git commit -m "feat(frontend/sync): オンライン編集も IndexedDB キューを経由するよう統一"
```

---

## トラブルシュート

### Q. `applyOfflineEdit` で userId エラーが出る

- `existing` が null（DB にレコードなし）でかつ `requireUserIdFromRecord` が throw する設計
- 新規作成直後の updateMemo はオンラインで通った後に IndexedDB に snapshot されるので、通常は問題なし
- 問題が起きた場合は `createMemo` 側のフローも見直す（このガイドの範囲外）

### Q. テストで `mockRepo.removePending` が呼ばれてない

- 4xx エラーパスでは呼ばれる
- 「ネットワーク失敗」パスでは**呼ばれないのが正解**（キューに残す）
- 区別は `isLikelyNetworkError` のマッチング次第

### Q. オンラインのつもりが offline-saved になる

- `isLikelyNetworkError` が誤判定してる可能性
- API が `Failed to fetch` などのワードを含むエラーメッセージを返してないか確認

---

## 次のステップ

- **案②（Operation 化）**: 送る patch を「変更フィールドだけ」に絞る → [`03-operation-based.md`](./03-operation-based.md)
- **案④（タグも 1 コール化）**: 別 API になってる `assignTags` を統合 → [`04-atomic-transaction.md`](./04-atomic-transaction.md)

---

## 参考

- 元レポート: [`docs/development/notion-auto-save-research.md`](../notion-auto-save-research.md)
- 既存実装: `frontend/src/utils/sync/sync-engine.ts`（drain ロジック）
- 既存実装: `frontend/src/utils/offline/db.ts`（pending_operations スキーマ）
