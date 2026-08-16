# Requirements Document

## Project Description (Input)

ノートブック編集画面（NotebookEditor）への自動保存（autosave）導入。

## 背景・動機

ドッグフーディングの friction log 起点。現状 NotebookEditor は useAutoSave を配線しておらず、手動の「保存/更新」ボタンを押さないと保存されない。一方 MemoEditor は useAutoSave による debounce 自動保存＋保存状態インジケーター（保存中/保存済み/N分前）を備えており、ノートブックとメモで保存体験が一貫していない。ユーザーは「ノートブックは自動保存されないと思う」という摩擦を記録した。

## やりたいこと

- NotebookEditor にメモと同等の自動保存を導入し、編集を止めると debounce で自動保存される
- 保存状態（保存中/保存済み/相対時刻）をメモと一貫した形で提示する
- 既存の手動「保存/更新」ボタンとの関係を整理する（残す/置き換える/明示保存として併存のいずれか）

## 既存の参考実装・制約

- frontend/src/hooks/useAutoSave.ts（debounce・保存状態・OfflineSavedSignal）
- frontend/src/components/memo/MemoEditor.tsx（useAutoSave 配線・保存状態インジケーター・Ctrl/Cmd+S 明示保存・memo id 切替時の state 再同期パターン）
- frontend/src/components/notebook/NotebookEditor.tsx（現状は handleSave 手動保存のみ。name/content/themeId/タグの hasChanges 検知あり。タグ割り当ては assignTagsToNotebook で保存後に別 API 実行。保存成功で goToNotebookList へ遷移）
- アーキ不変則: サーバー状態の真実の源泉は React Query（Zustand へコピー禁止）、API は apiClient 経由、所有権チェックは AuthorizationService
- 注意点: 新規作成(isCreate)時の自動保存の扱い（メモは pending title 等の特殊処理あり）、テーマ変更やタグ変更の autosave 対象可否、保存後の goToNotebookList 遷移との整合

## スコープ外（想定）

- メモ側 autosave の挙動変更
- ノートブックのリアルタイム共同編集
- ノートブック保存のオフライン対応の新規実装（メモの memo-bridge 相当の同期キューはノートブックに未整備のため、本仕様では offline-saved 経路を新設しない）

## Requirements

### Requirement 1: ノートブックの自動保存（debounce）

**Objective:** ノートブック編集者として、編集を止めるだけで内容が自動保存されてほしい。保存ボタンの押し忘れによる作業消失を防ぎ、メモと一貫した保存体験を得るため。

#### Acceptance Criteria

1. When ユーザーがノートブック名（name）または本文（content）を変更する, the NotebookEditor shall debounce タイマーを開始し保存状態を「保存待ち（pending）」に遷移する。
2. While debounce タイマーが動作中にユーザーが追加の変更を行う, the NotebookEditor shall 既存タイマーをリセットし、最後の変更から debounce 待機時間が経過した時点で 1 回だけ保存を実行する。
3. When debounce タイマーが発火し変更が存在する, the NotebookEditor shall `apiClient` 経由で（直接 `fetch` を用いず）保存を実行する。
4. If name と content がいずれも空文字（trim 後）である, then the NotebookEditor shall 自動保存を実行しない。
5. While 直前の保存処理が進行中（isSaving）である, the NotebookEditor shall 新たな自動保存の実行を抑止し、保存待ち状態を維持する。
6. The NotebookEditor shall サーバー状態の真実の源泉を React Query に置き、保存対象データを Zustand へコピーしない。

### Requirement 2: 保存状態インジケーター

**Objective:** ノートブック編集者として、いま保存されているか／最後にいつ保存されたかを画面上で確認したい。保存状況への不安をなくすため。

#### Acceptance Criteria

1. While 自動保存または明示保存が進行中である, the NotebookEditor shall 「保存中」を示すインジケーターを表示する。
2. When 保存が成功する, the NotebookEditor shall 「保存済み」と最終保存時刻からの相対時刻（例: 今しがた / N分前）を併記して表示する。
3. While 保存済みの相対時刻を表示している, the NotebookEditor shall 一定間隔（メモと同じ 30 秒）で相対時刻表示を更新する。
4. While 既存ノートブックを編集中で保存状態が idle（初期表示または全変更が巻き戻された無変更状態）である, the NotebookEditor shall 「保存済み」を表示する。
5. The NotebookEditor shall 保存状態インジケーターの文言・トーン（色）・相対時刻フォーマットをメモ（save-status-presentation）と一貫させる。
6. When 新規作成中でまだ保存対象が確定していない, the NotebookEditor shall 保存済み等のインジケーターを表示しない。

### Requirement 3: 明示保存（手動保存ボタン／キーボードショートカット）との併存

**Objective:** ノートブック編集者として、自動保存に加えて任意のタイミングで明示的に保存できるようにしたい。確実に保存したい場面で安心して操作するため。

#### Acceptance Criteria

1. The NotebookEditor shall 自動保存導入後も明示保存手段（保存／更新ボタン）を保持する。
2. When ユーザーが Ctrl+S または Cmd+S を押下する, the NotebookEditor shall ブラウザ既定動作を抑止し、進行中の debounce をキャンセルして即時に保存を実行する。
3. When ユーザーが明示保存（ボタンまたはショートカット）を実行する, the NotebookEditor shall 進行中の debounce タイマーをキャンセルし、自動保存との二重保存を防止する。
4. While 保存対象の変更が存在しない、または保存処理が進行中である, the NotebookEditor shall 明示保存ボタンを非活性にする。
5. When 明示保存が成功する, the NotebookEditor shall 自動保存と同一の保存状態インジケーター更新を行う。

### Requirement 4: 画面遷移との整合

**Objective:** ノートブック編集者として、自動保存のたびに画面が一覧へ飛ばされず、編集を継続できるようにしたい。集中して編集を続けるため。

#### Acceptance Criteria

1. When 自動保存が成功する, the NotebookEditor shall ノートブック一覧へ遷移せず、現在の編集画面を維持する。
2. When ユーザーが明示的に編集の完了／キャンセルを操作する, the NotebookEditor shall その操作に応じてノートブック一覧へ遷移する。
3. While 自動保存が成功して編集画面を維持している, the NotebookEditor shall 直近のユーザー入力を保持し、保存完了による再フェッチで入力内容を上書きしない。

### Requirement 5: 新規作成（isCreate）時の自動保存

**Objective:** ノートブック作成者として、新規作成画面でも自動保存が働き、かつ同一ノートブックが重複作成されないようにしたい。下書き段階から作業を失わず、データの重複を防ぐため。

#### Acceptance Criteria

1. When 新規作成中に name または content が非空となり debounce が発火する, the NotebookEditor shall 新規ノートブックを 1 件作成する。
2. When 新規作成の自動保存が初めて成功する, the NotebookEditor shall 以降の保存が同一ノートブックへの更新となるよう編集モード（既存ノートブック編集）へ遷移する。
3. While 新規作成の自動保存が完了して編集モードへ遷移する, the NotebookEditor shall ノートブック一覧へ遷移せず編集を継続できる状態を維持する。
4. If 新規作成時に name と content がいずれも空である, then the NotebookEditor shall ノートブックを作成しない。

### Requirement 6: テーマ・タグ変更の自動保存対象

**Objective:** ノートブック編集者として、テーマやタグの変更も自動保存に反映されてほしい。フィールドごとに保存挙動が異なる混乱を避けるため。

#### Acceptance Criteria

1. When ユーザーがテーマ（themeId）を変更する, the NotebookEditor shall 当該変更を自動保存（ノートブック更新ペイロード）の対象に含める。
2. When ユーザーがタグの割り当てを変更する, the NotebookEditor shall 当該変更を自動保存のトリガーとして扱う。
3. When ノートブック本体の保存が成功する, the NotebookEditor shall `apiClient.assignTagsToNotebook` を用いてタグ割り当てを反映する。
4. If タグ割り当て API が失敗する, then the NotebookEditor shall ノートブック本体の保存結果を破棄せず、エラーをログに記録する。

### Requirement 7: エラー時の挙動

**Objective:** ノートブック編集者として、自動保存が失敗したときにそれが分かり、入力内容が失われないようにしたい。通信不良時にも安心して編集を続けるため。

#### Acceptance Criteria

1. If 自動保存または明示保存がサーバーエラーで失敗する, then the NotebookEditor shall 保存状態を「エラー」として提示する。
2. If 保存が失敗する, then the NotebookEditor shall ユーザーの入力内容（name / content / themeId / 選択タグ）を保持し破棄しない。
3. When 保存失敗後にユーザーが再度編集する, the NotebookEditor shall 改めて自動保存を試行する。

### Requirement 8: 編集対象切替時の状態再同期

**Objective:** 複数ノートブックを行き来する編集者として、別のノートブックを開いたときに前のノートブックの保存タイマーや入力が混入しないようにしたい。誤保存や入力消失を防ぐため。

#### Acceptance Criteria

1. When 編集対象のノートブックが切り替わる, the NotebookEditor shall 進行中の debounce タイマーをキャンセルする。
2. When 編集対象のノートブックが切り替わる, the NotebookEditor shall 新しい対象の name / content / themeId / タグ / 最終保存時刻でフォーム状態を再同期する。
3. While 同一ノートブックを編集中に React Query の再フェッチで参照のみが変化する, the NotebookEditor shall フォーム状態を再同期せず、直近のユーザー入力を保持する。
