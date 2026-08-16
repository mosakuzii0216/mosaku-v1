# Research & Design Decisions: notebook-autosave

---

## Summary

- **Feature**: `notebook-autosave`
- **Discovery Scope**: Extension（既存 NotebookEditor への自動保存導入。Light Discovery を実施）
- **Key Findings**:
  - `useAutoSave` / `describeSaveStatus` / `formatRelativeTime` は**無改修で再利用可**。`MemoEditor` が autosave 配線の完成テンプレート。新規 API / Query フックは不要。
  - レイアウトは `create`/`edit` を**同一 `NotebookEditor` を同位置で出し分け**ており、React はコンポーネントインスタンスを保持する。gap-analysis が懸念した「再マウントによる入力消失」は実際には発生しない。真のリスクは **id 切替時の再同期ロジックが `editingNotebook`（オブジェクト全体）依存**であり、invalidate の参照変化で直近入力が上書きされる点（既知の dogfooding 教訓と同型）。
  - 破壊点は確定: 現 `handleSave` は保存成功時に**必ず `goToNotebookList()` を呼ぶ**。自動保存ではこの遷移副作用を分離する必要がある（Req 4.1）。

## Research Log

### NotebookEditor は MemoEditor とどこが構造的に異なるか

- **Context**: MemoEditor を写経すれば足りるか、追加の設計論点があるかを見極める。
- **Sources Consulted**:
  - `frontend/src/components/memo/MemoEditor.tsx`（autosave 配線・id 切替再同期・Ctrl/Cmd+S・tick の参照実装）
  - `frontend/src/components/notebook/NotebookEditor.tsx`（改修対象）
  - `frontend/src/components/layouts/DesktopLayout.tsx` L106-116 / `MobileLayout.tsx` 同等
  - `frontend/src/hooks/useNavigation.ts` L60-78、`frontend/src/stores/useViewStore.ts`
- **Findings**:
  - MemoEditor は編集対象 `memo` を**親レイアウトから prop で受け取る**（`selectedMemo` はリストキャッシュから同期解決済み）。そのため id 切替の再同期 effect は `[memoId, isCreate]` の **id のみ依存**で成立し、invalidate 由来の参照変化で再同期されない（L169-200 のコメント参照）。
  - NotebookEditor は編集対象を **コンポーネント内部の `useNotebook(notebookId)` で取得**する。`create→edit` 直後や既存ノートを開いた直後は `editingNotebook` が `undefined`（フェッチ中）になりうる。MemoEditor と同じ「id のみ依存」にすると、データ未到着時に空でリセットしてしまう／到着しても再 sync されない、という二律背反が生じる。
  - レイアウト分岐: `case 'create' → <NotebookEditor isCreate />` / `case 'edit' → <NotebookEditor notebookId=... />`。両者は同型コンポーネント・同位置のため React はインスタンスを保持（key 無し）。edit 分岐に null ガードが無いため、`selectedNotebookId` が立っていればアンマウントされない。
- **Implications**:
  - 再同期は **「id 単位で 1 回だけ」かつ「データ到着を待つ」** 二条件を満たす ref ガード方式が必要（MemoEditor の純 id 依存より一段堅牢）。これが本設計の中心論点。
  - `create→edit` 遷移で `editingNotebook` のフェッチ往復をゼロにするため、作成成功時に **React Query detail キャッシュを seed**（`setQueryData`）して保存済み値を即時供給する。

### 自動保存と画面遷移の責務分離

- **Context**: 現 `handleSave` は保存成功＝一覧遷移。自動保存では遷移してはならない（Req 4.1）。
- **Findings**: `handleSave` の `onSuccess` 内 `goToNotebookList()` 呼び出し（L110/114/135/139）が遷移の源。タグ割り当て成否いずれでも遷移している。
- **Implications**: `handleSave` から**全ての `goToNotebookList()` を除去**し、純粋な保存関数にする。一覧遷移は明示的な「閉じる／キャンセル」操作（既存ボタン）にのみ残す（Req 4.2）。`create` 成功時は遷移ではなく **edit モードへの内部切替**（`setSelectedNotebookId` + `setCurrentView('edit')`）に置換し、重複作成を防止（Req 5.2）。

### テーマ・タグの autosave トリガーと反映順序

- **Context**: name/content だけでなく theme/tag も自動保存対象にする（Req 6）。
- **Findings**: 現状 `hasChanges` 検知は `selectedTagIds` を依存に含むが**タグ差分を比較していない**（name/content/theme のみ比較）。`assignTagsToNotebook` は本体保存成功後に別 API で実行する既存順序あり。
- **Implications**: タグ toggle / theme 変更の onChange に `scheduleAutoSave()` を結線。`hasChanges` にタグ差分比較を追加。本体保存成功後に `assignTagsToNotebook` を実行し、失敗時はログのみで本体結果を破棄しない（Req 6.4）。

### オフライン経路の扱い

- **Context**: メモは `memo-bridge` 同期キューで `offline-saved` 経路を持つ。
- **Findings**: ノートブックには同期キューが未整備。要件スコープ外（requirements.md スコープ外 line 29）。
- **Implications**: `useAutoSave` の `onSave` 戻り値は `void` のみ運用し、`OfflineSavedSignal` 経路は新設しない。`describeSaveStatus` の `offline-saved` 分岐はノートでは到達しない（型網羅のため共有モジュールには残置）。

## Architecture Pattern Evaluation

| Option                                                     | Description                                                                                                             | Strengths                                                                           | Risks / Limitations                                                        | Notes                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| A. NotebookEditor 直接拡張（表示ロジックもインライン複製） | MemoEditor を写経し autosave を配線。表示ロジックも複製                                                                 | 最速・メモ無改変                                                                    | Req 2.5 の一貫性が人手レビュー頼み。文言ドリフト余地                       | gap-analysis Option A |
| B. 保存ロジックを共通フックへ抽出                          | 両エディタ共通の autosave ラッパを新規化                                                                                | 重複削減                                                                            | **スコープ外**（メモ側挙動変更）。ペイロード/遷移先が異なり費用対効果低    | 不採用                |
| C. A 実装 + 表示ロジックのみ共有化【採用】                 | 実装は NotebookEditor 拡張。`describeSaveStatus`/`formatRelativeTime`/トーンクラスを中立モジュールへ集約し両者で import | Req 2.5 をコードで構造的に担保。メモのロジック本体は無改変（import 元付け替えのみ） | プレゼンテーション関数のファイル移動でメモ側 import 変更（軽微・挙動不変） | **ユーザー承認済み**  |

## Design Decisions

### Decision: 編集対象切替の再同期は「id 単位 1 回 + データ到着待ち」の ref ガード

- **Context**: NotebookEditor は編集対象を内部 `useNotebook` で取得するため、MemoEditor の純 id 依存 effect が使えない（Findings 参照）。Req 8.2/8.3・4.3・5.3 を同時に満たす必要。
- **Alternatives Considered**:
  1. MemoEditor と同じ `[notebookId, isCreate]` のみ依存 — データ未到着時に空リセット、到着後に再 sync されず破綻。
  2. `editingNotebook` をそのまま依存 — invalidate の参照変化で毎回 sync され入力消失（現状バグ源）。
- **Selected Approach**: `syncedIdRef`（最後に同期した notebookId、新規時はセンチネル）を保持。effect 依存は `[notebookId, isCreate, editingNotebook]`。本文で「`syncedIdRef.current !== notebookId` かつ `editingNotebook` 存在」のときだけ同期し ref を更新。同一 id の invalidate 再実行は ref ガードで早期 return。
- **Rationale**: 「id が変わったら 1 回だけ」「データ到着を待つ」を両立。invalidate 由来の参照変化を構造的に無視でき、Req 4.3/8.3 を保証。
- **Trade-offs**: ref による命令的ガードでやや複雑だが、内部 query 取得という構造制約には不可避。
- **Follow-up**: 既存ノートを開いた直後・`create→edit` 直後・連続保存後の各シナリオでテスト。

### Decision: create 成功時に detail キャッシュを seed して edit モードへ内部遷移

- **Context**: Req 5.2/5.3。作成後の保存を同一ノートへの更新にし、一覧へ遷移せず編集継続。
- **Selected Approach**: `createNotebook` の戻り値 `nb` で `qc.setQueryData(queryKeys.notebooks.detail(nb.id), nb)` を実行し、続けて `setSelectedNotebookId(nb.id)` + `setCurrentView('edit')`。edit 分岐の `useNotebook(nb.id)` はフェッチせず seed 値を即返す。
- **Rationale**: 遷移直後の `editingNotebook = undefined` 期間を消し、再同期 effect が保存済み値（＝現在の入力）を即同期。入力消失・フラッシュを回避。
- **Trade-offs**: キャッシュ手動 seed の一手間。React Query が真実の源泉である原則は維持（Zustand へコピーしない）。
- **Follow-up**: seed 値とサーバー再フェッチ値の整合（タグは別 API のため `getNotebookTags` で別途同期）。

### Decision: 自動保存は遷移しない。一覧遷移は明示「閉じる」操作のみ

- **Context**: Req 4.1/4.2、Req 3.1。
- **Selected Approach**: `handleSave` から全 `goToNotebookList()` を除去し純保存関数化。既存「保存/更新」ボタンは保存のみ（遷移なし）。既存「キャンセル」ボタンを「閉じる（一覧へ）」として残す（autosave 済みのため破棄ではなく完了の意味）。
- **Rationale**: 自動保存中の集中編集を阻害しない。明示完了の導線は維持。
- **Trade-offs**: 「キャンセル」ラベルの意味が変わるため「閉じる」へ改称。

### Decision: 表示ロジックを `utils/editor/save-status-presentation.ts` へ集約

- **Context**: Req 2.5、採用 Option C。
- **Selected Approach**: `describeSaveStatus` / `formatRelativeTime` / `SaveStatusTone` / `SaveStatusDescription` / `exhaustiveSaveStatusKeys` / `SAVE_STATUS_TONE_CLASSES`（現状 MemoEditor 内ローカル定義）を新規 `utils/editor/save-status-presentation.ts` へ移設。メモ専用の `describeDeleteConfirm` は `utils/memo/` に残置し、型は editor モジュールから import。MemoEditor / NotebookEditor は editor モジュールを参照。
- **Trade-offs**: メモ側 import 経路の付け替え（挙動不変）。

## Risks & Mitigations

- **goToNotebookList の取り残し** — 自動保存経路に遷移副作用が 1 つでも残ると Req 4.1 違反。`handleSave` 内の全遷移除去をレビュー＆テストで確認。
- **再同期 ref ガードのシナリオ漏れ** — 既存ノート初回ロード／create→edit／連続保存／別ノート切替の 4 ケースを単体テストで網羅。
- **タグ API 失敗時の挙動** — `assignTagsToNotebook` 失敗で本体保存結果を破棄しないよう try/catch でログのみ（Req 6.4）。
- **共有モジュール移設のメモ側回帰** — `describeSaveStatus` 等の import 元変更がメモのテストを壊さないか確認（`MemoEditor.test.tsx`）。

## References

- `frontend/src/hooks/useAutoSave.ts` — debounce・saveStatus 状態機械（再利用）
- `frontend/src/components/memo/MemoEditor.tsx` — autosave 配線の参照実装
- `frontend/src/utils/memo/save-status-presentation.ts` — 移設対象の表示ロジック
- `frontend/src/hooks/useNotebookQueries.ts` — `useCreateNotebook`/`useUpdateNotebook`/`useNotebook`
- `frontend/src/utils/api.ts` L320/494/507 — `assignTagsToNotebook`/`getNotebook`/`createNotebook`/`updateNotebook`
- `.kiro/specs/notebook-autosave/gap-analysis.md` — 現状調査・要件対応マップ
