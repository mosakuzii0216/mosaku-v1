# Notion 流 自動保存 写経シリーズ

Mosaku の自動保存を Notion アーキテクチャに近づける、段階的な写経ガイド集。

## 元ネタ

- 調査レポート: [`../notion-auto-save-research.md`](../notion-auto-save-research.md)

## ガイド一覧

| #   | ファイル                                                 | 案  | 想定時間  | 範囲               | 前提 |
| --- | -------------------------------------------------------- | --- | --------- | ------------------ | ---- |
| 01  | [`01-debounce.md`](./01-debounce.md)                     | 案① | 30〜40分  | frontend のみ      | なし |
| 02  | [`02-persistent-queue.md`](./02-persistent-queue.md)     | 案③ | 60〜90分  | frontend のみ      | 01   |
| 03  | [`03-operation-based.md`](./03-operation-based.md)       | 案② | 60〜90分  | frontend のみ      | 02   |
| 04  | [`04-atomic-transaction.md`](./04-atomic-transaction.md) | 案④ | 90〜120分 | backend + frontend | 03   |

## 順序の意図

```
01 (デバウンス) ─→ 02 (永続キュー) ─→ 03 (Operation) ─→ 04 (アトミック)
   軽い              中規模              中規模           backend も絡む
   ↑                ↑                  ↑                ↑
リハーサル        体験の核心          帯域削減         整合性 + 統合
```

- **01** は写経の「型」を体験するためのリハーサル
- **02** で永続キューを通すフローに統一（Notion の TransactionQueue モデル）
- **03** で差分送信に切替（Notion の Operation モデル）
- **04** で memo + tag を 1 トランザクション化（Notion の saveTransactions モデル）

## 進め方の推奨

1. **1 ガイドずつコミット**: 各 Step 末の `git commit` で区切る
2. **テストは都度 green**: `npm run test` を通してから次ガイドへ
3. **動作確認は必ず**: dev server で挙動を体で覚える
4. **詰まったらトラブルシュート章**: 各ガイド末尾にある

## 写経が終わったら何が手に入る？

- ✅ デバウンス 200ms（体感ほぼ即時保存）
- ✅ タブを閉じても保存中の変更が消えない（永続キュー）
- ✅ 変更フィールドだけ送信（帯域・競合耐性）
- ✅ メモ更新とタグ割当が原子的（オフライン時も整合性 OK）

Notion 流の **「永続キュー + Operation + アトミック更新」** の骨格はここまでで揃う🔥

## 次のフェーズ（未着手）

- 案⑤: version history 非同期化
- 案⑥: WebSocket push 同期
- 案⑦: CRDT 導入

これらは前提や要件が固まってから別途検討。
