# Notion 自動保存アーキテクチャ調査と Mosaku への適用案

> 調査日: 2026-05-23
> 目的: Mosaku の自動保存を Notion 流（永続キュー + Operation ベース）に近づけるための前段調査
> ステータス: 調査完了 / 写経手順は別途検討

---

## 1. Mosaku 現状の自動保存

### 1.1 主要モジュール

| ファイル                                              | 役割                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `frontend/src/hooks/useAutoSave.ts`                   | デバウンス制御・SaveStatus 状態機械                     |
| `frontend/src/components/memo/MemoEditor.tsx`         | エディタ。`scheduleAutoSave()` を各フィールド変更で呼ぶ |
| `frontend/src/utils/memo/save-status-presentation.ts` | SaveStatus → 表示文言の変換                             |
| `frontend/src/utils/memo/memo-bridge.ts`              | オンライン/オフラインの保存先振り分け（IndexedDB 経由） |

### 1.2 フロー

```
編集 → scheduleAutoSave() → 1000ms デバウンス → handleSave()
        ↓
     canSave && !isSaving 再評価
        ↓
     PUT /memos/:id  または  POST /memos
        ↓
     onSuccess: saveStatus = 'saved'
     onError:   saveStatus = 'error'
     オフライン: saveStatus = 'offline-saved'（IndexedDB に積む）
```

### 1.3 SaveStatus

`idle` / `pending` / `saving` / `saved` / `offline-saved` / `error` の6状態。
`saved` は次の編集まで永続表示する設計（ユーザーへの安心感のため）。

### 1.4 強み

- フックに切り出されてテスタブル
- stale closure 対策に ref パターン
- オフライン保存の signal を型で表現（`OFFLINE_SAVED_SIGNAL`）

### 1.5 弱み（Notion 対比）

- **保存単位がメモ全体**: タグ1個変えても title + content + tags をフルに PUT
- **キューが React 状態のみ**: タブ閉じたら未保存変更が消える
- **1秒デバウンスが固定**: 入力止まってもまだ1秒待つ → 体感「保存遅め」
- **タグ更新は別 API** (`assignTags`): `offline-saved` 時はタグ反映スキップしてる

---

## 2. Notion の自動保存アーキテクチャ

### 2.1 全体像

```
編集 → Operation 生成
      ↓
   TransactionQueue (IndexedDB / SQLite)
      ↓ （空なら即送信、混んでたら順次）
   /saveTransactions API
      ↓
   before ロード → after 計算 → 検証 → DB commit
      ↓
   MessageStore（pub/sub）通知
      ↓ WebSocket push
   他クライアントが syncRecordValues で差分 fetch
```

### 2.2 重要コンセプト

#### A. Operation / Transaction モデル

- 編集を **「単一レコードを作成 or 更新する Operation」** に分解
- 複数 Operation を **Transaction** にまとめて原子的に commit
- 例: 「ブロックのテキスト変更」「ブロックを追加」「順序変更」がそれぞれ Operation

> "Changes are expressed as operations that create or update a single record. Operations are batched into transactions that are committed (or rejected) by the server as a group."
> — [Exploring Notion's Data Model](https://www.notion.com/blog/data-model-behind-notion)

#### B. TransactionQueue（永続キュー）

- **IndexedDB（Web）/ SQLite（デスクトップ・モバイル）** に保存
- サーバーが persist する or reject するまで保持
- **「通常はキューが空」** → 編集即送信モデル

> "Usually, TransactionQueue sits empty, so the transaction to create the block is sent to Notion's server right away in an API request."

#### C. `saveTransactions` API

サーバー側パイプライン:

1. 影響を受けるブロックをロード → **before 状態**
2. Operations を適用 → **after 状態**
3. 権限とデータ整合性を検証
4. DB commit
5. クライアントに成功返却
6. **バックグラウンドで** version history snapshot と indexing

→ version history は保存レイテンシに含めない設計。

#### D. MessageStore + WebSocket

- 保存成功時にサーバーは MessageStore（リアルタイム pub/sub）に通知
- クライアントは record 単位で subscribe
- 通知を受けたら `syncRecordValues` で差分 fetch → ローカルキャッシュ更新 → 再描画

### 2.3 オフラインモード（2025年8月リリース）

- **SQLite キャッシュを durable persistence に昇格**（従来は best-effort）
- **ページ単位の opt-in**（「Available offline」トグル）
- `offline_page` / `offline_action` 2 テーブル構成
  - 「なぜオフライン対象か」を多重管理（手動 / お気に入り / 自動DL / 継承）
- 再接続時は `lastDownloadedTimestamp` vs `lastUpdatedTime` 比較で差分 fetch
- **CRDT（Conflict-free Replicated Data Types）** で競合解決
  - オフライン対象ページは動的に CRDT データモデルへマイグレーション

#### 既知の制約

- データベースは最初の50行のみ DL
- Embed / Forms / AI / Button はオフライン非対応
- モバイルは Wi-Fi のみ同期

---

## 3. Mosaku への適用案（優先度別）

### 3.1 優先度 高

#### 案①: 1秒デバウンスを薄くして「即送信モデル」へ

**変更点**:

- `useAutoSave` の `debounceMs` デフォルトを 1000 → 200 ms 程度に
- 既存リクエスト inflight 中は新規送信を抑止（既に `isSavingRef` ガードがあるので OK）

**影響範囲**: `useAutoSave.ts` のみ
**リスク**: バックエンドへの POST/PUT 頻度増。Rate limit や Cloud Run 課金影響を要計測。

#### 案②: Operation ベース（差分保存）への移行

**変更点**:

- メモ更新を「title 変更」「content 変更」「tag 追加/削除」「notebook 変更」の差分 Operation に分解
- バックエンドに `PATCH /memos/:id/operations` 的なエンドポイントを追加
- AuthorizationService.checkOwnership() は維持（CLAUDE.md の不変則）

**影響範囲**:

- `frontend`: `useAutoSave`, `MemoEditor`, `memo-bridge`
- `backend`: `MemoService` / `MemoController` に operation endpoint 追加
- Prisma: 変更なし（既存スキーマで OK）

**リスク**: 中。API 設計と offline 時のオペレーション順序保証が要点。

#### 案③: TransactionQueue を IndexedDB 永続化

**変更点**:

- `memo-bridge.ts` で既に IndexedDB を使っているので、未送信 Operation のキューを同じ DB に追加
- ページリロード時にキューを復元 → 順次送信
- `SaveStatus` に「queued」を追加するか検討

**影響範囲**: `memo-bridge.ts`, `useAutoSave.ts`
**リスク**: 中。同期順序、重複送信防止、上限サイズ管理が必要。

### 3.2 優先度 中

#### 案④: `saveTransactions` 風アトミック API

**変更点**:

- 現状 `PUT /memos/:id` と `assignTags` が別 API
- 1 トランザクションにまとめて、オフライン時もタグ更新が反映されるように
- `MemoEditor.tsx:117-125` の「オンライン時のみタグ同期」分岐が消える

**影響範囲**: `backend/memo` と `frontend/memo-bridge`
**リスク**: 低〜中。既存テストの再整備が要る。

#### 案⑤: version history を非同期化

**変更点**:

- 保存パスから history 書き込みを切り離す（cron or queue）
- p95 レイテンシ改善

**影響範囲**: `backend/memo` / 履歴系（あれば）
**前提**: そもそも version history を Mosaku がどこまで持つか未確定。仕様で先に決める。

### 3.3 優先度 低（将来）

#### 案⑥: WebSocket + push 同期

- シングルユーザー Mosaku では React Query invalidate で十分
- マルチデバイス同時編集を狙うときに検討

#### 案⑦: CRDT

- 共同編集を入れるときの話
- Yjs / Automerge / Loro などの選定が必要
- 単独ユーザーオフラインなら last-write-wins で足りる

---

## 4. 写経手順について（要検討）

### 4.1 なぜ「しばらく検討が必要」か

「写経」スタイルで手書き再現するには、以下を先に確定する必要がある:

1. **どの案から着手するか**
   - 案①（デバウンス調整）だけなら数行
   - 案②（Operation）だけで spec 1本になる規模
   - 案①〜③をまとめて1つの spec にするか分けるか

2. **マイルストーンの粒度**
   - 写経1回ぶんが「ファイル1つ完成」なのか「関数1つ完成」なのか
   - 各ステップで `npm run test` が green になる粒度に切る必要あり

3. **既存テストの位置づけ**
   - `useAutoSave.test.ts` を**先に書き換える**のか、後追いで書くのか
   - cc-sdd の TDD（RED → GREEN → REFACTOR）に乗せるべき

4. **検証ポイント**
   - 各ステップで「目で見て動いている」を確認する手順（dev server + Playwright）
   - 写経しただけで終わらせない仕組み

### 4.2 推奨アプローチ

**Step 1: 仕様駆動で起票**

```bash
/kiro:spec-init "自動保存を Operation ベース + 永続キューに改修"
```

→ requirements / design / tasks の3フェーズで人間が承認。

**Step 2: tasks.md を写経手順として再構成**

- 1 task = 1 写経セッション（30〜60分）
- 各 task に「写経対象ファイル」「期待される diff のサイズ」「green になるテスト」を明記

**Step 3: 写経テンプレートの形式を決める**
候補:

- `.kiro/specs/{name}/shakyo/step-N.md` に「Before / After / 解説」を並べる
- diff の右側だけを示して左を自力で書かせる「穴埋め」式
- テストを先に渡して実装を写経させる「TDD 模写」式

### 4.3 私（Claude）の見立て

**結論: しばらく検討は必要だけど、合計1〜2セッションで設計可能**。

具体的には:

1. 上記「3. Mosaku への適用案」のどれから着手するか合意（30分）
2. 該当範囲の spec を `/kiro:spec-init` で起票（要件まで詰める、60分）
3. tasks.md の各タスクに「写経ステップ番号」を割り振る（30分）

この3ステップが終われば、写経用 markdown 雛形を生成できる状態になるよ。

---

## 5. 参考リンク

- [Exploring Notion's Data Model: A Block-Based Architecture (Notion Blog)](https://www.notion.com/blog/data-model-behind-notion)
- [How we made Notion available offline (Notion Blog)](https://www.notion.com/blog/how-we-made-notion-available-offline)
- [Revolutionizing Information Management with Synced Blocks (Notion Blog)](https://www.notion.com/blog/designing-synced-blocks)
- [How Notion Was Built: Block Model, Architecture, and Sync Pipeline Explained (HowWorks)](https://howworks.ai/blog/how-notion-was-built)
- [Working offline in Notion (Notion Help)](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know)
- [Notion gains offline mode, but it's not quite automatic (9to5Mac, 2025-08-20)](https://9to5mac.com/2025/08/20/notion-offline-mode/)

---

## 6. 次のアクション候補

- [ ] 案①〜⑦のどれを最初に着手するか、ユーザーと合意
- [ ] 合意した範囲で `/kiro:spec-init` 実行
- [ ] tasks.md を写経ステップ単位に再構成
- [ ] 写経テンプレート（Before/After 形式 or TDD 模写形式）を1案で試作
