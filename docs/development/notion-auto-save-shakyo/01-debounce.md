# 写経ガイド 案①: デバウンスを薄くして即送信モデルに近づける

> 想定所要時間: 30〜40分
> 写経対象: `frontend/src/hooks/useAutoSave.ts` と `useAutoSave.test.ts`
> ゴール: 自動保存のデバウンスを 1000ms → 200ms に下げ、Notion 流「即送信」に1歩近づける

---

## 0. なぜこの変更をするのか

Notion の自動保存は **「TransactionQueue が空なら即送信」** モデル。
ユーザーが入力を止めた瞬間に、ほぼ遅延なくサーバーへ送られる。

Mosaku は現状 1000ms 固定で待つから「保存遅っ」と感じやすい。
案① では中間値の **200ms** に下げることで:

- 入力停止 → 0.2秒で保存開始（体感は「即時」に近い）
- まだデバウンス自体は残すので、タイピング中の連続リクエスト爆撃は防げる
- 5〜10行で完結する低リスクの変更

将来 Operation キュー化（案②③）に進む土台でもある。

---

## 0.1 事前準備

### 作業ブランチを切る

```bash
git checkout -b feat/frontend-autosave-debounce-200ms
```

### 現状のテストが green であることを確認

```bash
cd frontend
npm run test -- src/hooks/useAutoSave.test.ts
```

→ 13 件 pass することを確認してから写経開始。

---

## Step 1: `useAutoSave.ts` のデフォルト値を 1000 → 200 に

**ファイル**: `frontend/src/hooks/useAutoSave.ts`

### 1-A: JSDoc コメントの数字を変える（line 31）

#### Before

```ts
/** デバウンス待機時間（ms）。デフォルト 1000 */
debounceMs?: number;
```

#### After

```ts
/** デバウンス待機時間（ms）。デフォルト 200 */
debounceMs?: number;
```

### 1-B: デフォルト引数値を変える（line 47）

#### Before

```ts
export function useAutoSave({
	canSave,
	isSaving,
	onSave,
	debounceMs = 1000,
}: UseAutoSaveOptions): UseAutoSaveReturn {
```

#### After

```ts
export function useAutoSave({
	canSave,
	isSaving,
	onSave,
	debounceMs = 200,
}: UseAutoSaveOptions): UseAutoSaveReturn {
```

### 解説 💡

- JSDoc は IDE 補完時の説明に出るから、コードと同期させないと未来の自分を惑わせる
- 関数のデフォルト引数は **呼び出し側で `debounceMs` を省略したとき** に効く
- `MemoEditor.tsx:145` は `debounceMs` を渡してないので、ここを変えれば実プロダクトに反映される
- 既存の **ガード（`canSaveRef` / `isSavingRef`）はそのまま動く** ので、ロジック変更は不要

---

## Step 2: 新規テストを1本追加（デフォルト値の明示的アサーション）

**ファイル**: `frontend/src/hooks/useAutoSave.test.ts`

既存テストはどれも `vi.advanceTimersByTime(1000)` を使っていて、デフォルトが 1000 でも 200 でも pass する（200 < 1000 だから）。
それだと「デフォルトが本当に 200 になっているか」が誰も保証してない状態。

そこで **「199ms ではまだ発火しない / 200ms で発火する」** という境界テストを1本追加する。

### 2-A: テストファイルの末尾（`});` の直前、line 226 あたり）に以下を追加

#### After（追加するコード）

```ts
it('debounceMs のデフォルトは 200ms（境界テスト）', async () => {
	const onSave = vi.fn().mockResolvedValue(undefined);
	const { result } = renderHook(() => useAutoSave({ canSave: true, isSaving: false, onSave }));

	act(() => {
		result.current.scheduleAutoSave();
	});

	// 199ms 経過時点ではまだ発火しない
	await act(async () => {
		vi.advanceTimersByTime(199);
	});
	expect(onSave).not.toHaveBeenCalled();

	// 200ms 経過時点で発火
	await act(async () => {
		vi.advanceTimersByTime(1);
	});
	expect(onSave).toHaveBeenCalledTimes(1);
});
```

### 解説 💡

- **境界テスト** = 「ちょうどギリギリ手前」と「ちょうどギリギリ」の両方を検証する
- これを書いておくと、誰かが `debounceMs = 500` に勝手に戻したときに即座に test が fail する
- `vi.advanceTimersByTime` は **累積** で時間を進める。199 → +1 で合計 200ms

---

## Step 3: 既存テストの「1000ms」表記を整理（任意・推奨）

既存テストは全部 `vi.advanceTimersByTime(1000)` を使ってる。動作には影響ないけど、

- テスト名「デバウンス時間（1000ms）経過後に onSave が呼ばれること」がもう正しくない
- 実行時間が長くなる（fake timer なので実害は小さいが）

時間あれば修正したいポイント。

### 3-A: 該当テスト名を更新（line 26）

#### Before

```ts
it('デバウンス時間（1000ms）経過後に onSave が呼ばれること', async () => {
```

#### After

```ts
it('デバウンス時間経過後に onSave が呼ばれること', async () => {
```

### 3-B: （任意）`vi.advanceTimersByTime(1000)` を 200 に置換

11 箇所あるので時間ある時に。エディタの一括置換で:

```
検索:   vi.advanceTimersByTime(1000)
置換:   vi.advanceTimersByTime(200)
```

### 解説 💡

- ステップ 3-B はやらなくてもテストは pass する（1000ms 経過すれば 200ms のデバウンスはとっくに発火済み）
- やる場合は **置換後にもう一度テストを走らせて green を確認** すること

---

## Step 4: テストとビルドを通す

```bash
cd frontend
npm run test -- src/hooks/useAutoSave.test.ts   # 既存13本 + 追加1本 = 14本 pass
npm run lint                                     # フォーマット OK
npm run build                                    # 型エラーなし
```

すべて green になれば写経完了！🔥

---

## Step 5: 動作確認（dev server）

```bash
# プロジェクトルートで
npm run dev
```

ブラウザで `http://localhost:5173` を開いて:

1. 新規メモを作成（または既存メモを開く）
2. タイトルや本文を入力
3. **入力を止めてから0.2秒程度** で「保存中...」→「保存済み」表示が出ることを確認
4. 連続入力中（タイピング中）は何度入力しても「未保存」のままで、止めると保存が走ることを確認

### 比較しやすいよう、変更前後を体感する手順

- 変更前のブランチ `main` に戻る → 同じ操作をして「1秒待ち」を体感
- 変更後ブランチに戻る → 「0.2秒で反応」を体感
- 差を実感できたら勝ち🫶

---

## Step 6: コミット

```bash
git add frontend/src/hooks/useAutoSave.ts frontend/src/hooks/useAutoSave.test.ts
git commit -m "feat(frontend/autosave): デバウンスを 1000ms → 200ms に短縮"
```

`pre-commit` フックで Prettier が走るので、フォーマット崩れがあっても自動修正される。

---

## トラブルシュート

### Q. テストが落ちた

- 追加した境界テストが落ちる場合: `199` と `200` のどちらかでタイポしてないか確認
- 既存テストが落ちる場合: `useAutoSave.ts` の `debounceMs = 200` を超える時間（例: `100`）を `advanceTimersByTime` に渡してる箇所がないか確認

### Q. 体感で速くなった気がしない

- 開発者ツールの Network タブで `PUT /memos/:id` の発火タイミングを確認
- 入力停止から発火までが ~200ms 程度ならOK
- ~1000ms かかってる場合は dev server を再起動して反映を確認

---

## 次のステップ

案① が完了したら、次は:

- **案③: TransactionQueue を IndexedDB に永続化**（次の写経の候補）
- 既存の `memo-bridge.ts` の IndexedDB 利用と接続させる
- 「タブを閉じても未送信の保存が残る」体験を作る

→ `docs/development/notion-auto-save-shakyo/02-persistent-queue.md`（次の検討対象）

---

## 参考

- 元レポート: [`docs/development/notion-auto-save-research.md`](../notion-auto-save-research.md)
- Notion 公式: [Exploring Notion's Data Model](https://www.notion.com/blog/data-model-behind-notion)
