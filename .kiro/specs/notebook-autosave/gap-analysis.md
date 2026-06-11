# 実装ギャップ分析: notebook-autosave

> 本ドキュメントは設計判断のための情報整理であり、実装方針の最終決定ではない。要件（requirements.md）と既存コードベースの差分を整理する。

## 1. 現状調査（Current State）

### 関連アセット

| 種別                   | パス                                                            | 役割 / 再利用性                                                                              |
| ---------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 自動保存フック         | `frontend/src/hooks/useAutoSave.ts`                             | debounce・saveStatus 状態機械・cancelDebounce。**そのまま再利用可**（メモ非依存・汎用）      |
| 保存状態の表示ロジック | `frontend/src/utils/memo/save-status-presentation.ts`           | `describeSaveStatus` / `formatRelativeTime`。**メモ専用名前空間だが内容は汎用**              |
| 参照実装（完成形）     | `frontend/src/components/memo/MemoEditor.tsx`                   | autosave 配線・Ctrl/Cmd+S・id 切替再同期・相対時刻 tick の**お手本**                         |
| 改修対象               | `frontend/src/components/notebook/NotebookEditor.tsx`           | 現状は `handleSave` 手動保存のみ。255行                                                      |
| Query フック           | `frontend/src/hooks/useNotebookQueries.ts`                      | `useCreateNotebook` / `useUpdateNotebook` / `useNotebook`。invalidate 済み。**追加改修不要** |
| API クライアント       | `frontend/src/utils/api.ts`                                     | `createNotebook` / `updateNotebook` / `assignTagsToNotebook` / `getNotebookTags` 完備        |
| 画面遷移               | `frontend/src/stores/useViewStore.ts`, `hooks/useNavigation.ts` | `currentView: 'create'｜'edit'` + `selectedNotebookId` で編集対象を切替                      |
| レンダー親             | `frontend/src/components/layouts/{Desktop,Mobile}Layout.tsx`    | `currentView` 分岐で `<NotebookEditor isCreate />` / `notebookId=...` を出し分け             |

### 既存パターン・規約（要件と一致するもの）

- サーバー状態の真実の源泉は React Query（Zustand へコピー禁止）→ useAutoSave も保存対象を React Query mutation に委譲する設計で整合。
- API は `apiClient` 経由（Req 1.3 と一致）。
- テスト配置は同階層の `*.test.tsx`（`MemoEditor.test.tsx` あり）。**`NotebookEditor.test.tsx` は未作成 → 新規が必要**。
- `useAutoSave` は state を持つが Zustand には載せない（ローカル UI 状態）→ 不変則に抵触しない。

## 2. 要件↔アセット対応マップ（ギャップタグ付き）

| 要件                         | 既存アセット                                                | ギャップ                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 debounce 自動保存         | `useAutoSave`（そのまま利用可）                             | **Constraint**: NotebookEditor に未配線。`onChange`→`scheduleAutoSave` 結線が必要                                                                                              |
| R2 保存状態インジケーター    | `describeSaveStatus` / `formatRelativeTime` / tick パターン | **Missing**: NotebookEditor に表示要素・`lastSavedAt` state・30秒 tick が無い。`SAVE_STATUS_TONE_CLASSES` はメモ側にローカル定義                                               |
| R3 明示保存・Ctrl/Cmd+S 併存 | メモの keydown ハンドラ・保存ボタン                         | **Missing**: NotebookEditor に Ctrl/Cmd+S ハンドラ無し。保存ボタンは存在するが autosave と統合（cancelDebounce）が必要                                                         |
| R4 遷移しない                | —                                                           | **Constraint（破壊的）**: 現 `handleSave` は成功時 `goToNotebookList()` を呼ぶ。**自動保存ではこれを呼んではいけない**                                                         |
| R5 新規作成→編集モード遷移   | メモ: `setSelectedMemoId`+`setCurrentView('edit')`          | **Missing/Unknown**: NB 版は `setSelectedNotebookId(id)`+`goToNotebookEdit` 相当。**create→edit で別コンポーネントに再マウントされ初期ロード effect が走る**（下記リスク参照） |
| R6 テーマ・タグも保存対象    | `assignTagsToNotebook` / payload に themeId 既存            | **Constraint**: 現状 `selectedTagIds` は `hasChanges` 検知に含むが、テーマ/タグ変更時に `scheduleAutoSave` を呼ぶ結線が無い。タグ失敗時もログのみ継続（Req 6.4 と一致）        |
| R7 エラー時保持              | `saveStatus='error'` / `saveError` state                    | **Constraint**: useAutoSave が error を返すので表示は流用可。入力保持は「保存完了で再フェッチ上書きしない」設計と一体                                                          |
| R8 編集対象切替の再同期      | メモの `memoId` 依存 effect（id だけ依存）                  | **Missing（要注意）**: 現 NotebookEditor の初期ロード effect は `editingNotebook`（オブジェクト全体）依存 → invalidate で参照変化すると再同期され入力が消える既知パターン      |

## 3. 実装アプローチ案

### Option A: NotebookEditor を直接拡張（MemoEditor を踏襲）【推奨】

- **対象**: `NotebookEditor.tsx` に `useAutoSave` を配線。`handleSave` を async 化し goToNotebookList を分離。Ctrl/Cmd+S・lastSavedAt・tick・インジケーターを追加。
- **トレードオフ**:
  - ✅ MemoEditor という完成テンプレートをほぼ写経でき、体験の一貫性（Req 2.5）を最短で満たす
  - ✅ 新規ファイル最小、既存 Query/API 改修ゼロ
  - ❌ NotebookEditor が肥大化（255→350+行）。テーマ/タグ等メモに無い軸があり単純コピー不可

### Option B: 保存ロジックを共有フックに抽出（`useEditorAutoSave` 等）

- **対象**: メモ/ノート共通の「canSave 派生・handleSave ラップ・lastSavedAt・tick・Ctrl+S」を新規フックへ。両エディタから利用。
- **トレードオフ**:
  - ✅ 重複削減、将来の保存挙動変更が一箇所
  - ❌ **スコープ外**（メモ側 autosave の挙動変更は要件で除外 line 27）。メモを巻き込むリファクタはリスク増。今回は過剰
  - ❌ メモとノートはペイロード形・タグ反映タイミング・遷移先が異なり、抽象化の費用対効果が低い

### Option C: ハイブリッド（A をベースに表示ロジックだけ共有化）

- **対象**: 実装は Option A。ただし `save-status-presentation.ts`（`describeSaveStatus`/`formatRelativeTime`）と `SAVE_STATUS_TONE_CLASSES` を `utils/memo/` から中立な場所（例 `utils/editor/` か `components/editor/`）へ移動 or 再エクスポートし両者で共有。
- **トレードオフ**:
  - ✅ Req 2.5「メモと一貫」を**コード共有で保証**（文言ドリフトを構造的に防ぐ）
  - ✅ メモのロジックには手を入れない（import 元の付け替えのみ）
  - ❌ ファイル移動でメモ側 import 変更が発生（軽微）

## 4. リスク・複雑度

| 項目                                                                            | 評価                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **goToNotebookList の分離（Req 4）**                                            | 現 handleSave は保存成功＝一覧へ遷移。自動保存ではこの副作用を切り離す必要。**回帰しやすい破壊点** → 明示「完了」操作を別ボタンに                                                                              |
| **create→edit 再マウントでの入力消失（Req 5.3 / R8）**                          | メモは同一コンポーネントが prop 変化で残るが、NB は `create`→`edit` で**別レンダー分岐＝再マウント**し初期ロード effect が走る。保存往復中のタイプ入力が server 値で上書きされる典型バグ。**最優先の設計論点** |
| **初期ロード effect の依存を `editingNotebook` 全体→ `notebookId` (id) へ変更** | メモの dogfooding 教訓（MemoEditor L169-172）と同型。invalidate 後の参照変化で入力消失を防ぐため必須                                                                                                           |
| **タグ/テーマの autosave トリガー結線**                                         | onChange に `scheduleAutoSave` を足すだけだが、タグは保存後 `assignTagsToNotebook` を別 API で叩く順序制御が要る                                                                                               |
| **describeSaveStatus の `pending` ラベルが「未保存」**                          | メモと同一文言で一貫（Req 2.5）。要件 2 の「保存待ち」表現と語彙が違う点は設計で許容確認                                                                                                                       |

- **Effort**: **M（3〜7日）** — useAutoSave 自体は完成品で再利用だが、create→edit 再マウント問題・遷移副作用の分離・テーマ/タグ軸の上乗せ・テスト新規作成があり単純写経では済まない。
- **Risk**: **Medium** — 個々は既知パターン。ただし新規作成時の重複作成防止と入力消失の両立に設計上の注意が必要。

## 5. 設計フェーズへの申し送り

### 推奨アプローチ

- **Option C（A 実装 + 表示ロジック共有化）** を軸に。実装本体は NotebookEditor 拡張、`describeSaveStatus`/`formatRelativeTime`/トーンクラスは中立化して両エディタ共有（Req 2.5 を構造的に担保）。

### 主要な設計判断（要決定）

1. **create→edit 遷移の実現方式**: 再マウントを許容し「保存往復中の入力を保持しつつ初期ロード effect を抑止」するか、isCreate→edit を同一マウントで扱うか。メモは後者寄り。**最重要論点**。
2. **遷移の責務分離**: 自動保存は遷移しない。「完了」操作（一覧へ戻る）を現キャンセル/保存ボタンとどう再編するか（Req 3.1 と 4.2）。
3. **タグ autosave の粒度**: タグ変更を即 trigger するか（Req 6.2）、本体保存成功後に assignTags を続ける現順序を保つか。
4. **idle 表示の扱い**: 既存編集中 `idle`→「保存済み」表示（Req 2.4）をメモと同一分岐で実装。

### Research Needed（設計時に確認）

- `create`→`edit` 切替時に RichTextEditor の `focusKey`/再マウント挙動でカーソル・入力が保持されるか（メモは `focusKey={memo?.id||'new'}` で制御）。
- `save-status-presentation.ts` を `utils/memo/` から移動した際のメモ側 import 影響範囲（テスト含む）。
- ノートブックにはメモの memo-bridge（オフライン同期キュー）が無い前提（要件スコープ外 line 29）。`offline-saved` 経路は**新設しない**＝ useAutoSave の戻り値は `void` のみ運用。

---

## まとめ（Analysis Summary）

- **再利用度が非常に高い**: `useAutoSave` と `save-status-presentation` は無改修で流用でき、MemoEditor が完成テンプレート。新規 API/Query は不要。
- **本質的ギャップは3点**: ①自動保存成功時に `goToNotebookList()` を呼ばない遷移責務の分離（破壊点）、②`create→edit` 再マウントでの入力消失回避、③初期ロード effect の依存を id 限定に変更。
- **メモに無い軸**（テーマ・タグ・別コンポーネント遷移）があるため単純コピーは不可。Option C（拡張＋表示ロジック共有化）を推奨。
- **Effort M / Risk Medium**。新規 `NotebookEditor.test.tsx` の作成が前提。
- **スコープ厳守**: メモ側 autosave 改変とオフライン同期は対象外。

### Document Status

gap-analysis.md の枠組み（現状調査→要件対応マップ→A/B/C 案→Effort/Risk→申し送り）に沿って作成。言語は spec.json 指定の `ja`。

### Next Steps

`/kiro:spec-design notebook-autosave` で技術設計へ。上記「主要な設計判断」4点と「Research Needed」3点を設計に取り込むこと。
