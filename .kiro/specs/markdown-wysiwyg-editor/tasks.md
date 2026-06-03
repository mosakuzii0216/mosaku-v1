# Implementation Plan

> 並列実行可能なタスクには番号直後に `(P)` を付与。`(P)` の無いタスクは直前タスクの成果物へ依存する。

- [ ] 1. 共有拡張ファクトリ createEditorExtensions の構築（依存追加・ノード定義の単一情報源）
- [x] 1.1 新規依存パッケージの追加とバージョン統一
  - TaskList/TaskItem 用、コードブロック構文ハイライト用、lowlight 本体の3点を追加する
  - TipTap 系2点は既存コア（3.22.2）へバージョンを統一し、lowlight は v3 系を採用する
  - 既存 StarterKit / suggestion / tippy.js は据え置き、Mention 依存は後続タスクで除去する前提を確認する
  - _Requirements: 4.3, 5.1_

- [ ] 1.2 lowlight インスタンスと構文ハイライト基盤の整備
  - lowlight インスタンスをモジュールスコープで1度だけ生成し編集・公開で共有する
  - 既定の言語サブセット（js/ts/json/html/xml/css/bash/shell/python/sql/markdown/diff 等）を register する
  - 未登録言語はハイライト無しのプレーン code として描画し例外を投げない
  - ハイライト用 CSS をエディタスコープへ限定し既存テーマ CSS と衝突させない
  - _Requirements: 4.3_

- [ ] 1.3 createEditorExtensions ファクトリの実装
  - StarterKit を configure し、見出しレベルを H1〜H3 に限定、codeBlock を無効化して Lowlight 版へ差し替える
  - Link を autolink/linkOnPaste/protocols 限定/rel 付与/inclusive:false で設定し、URL 自動リンク化と範囲非拡張を成立させる
  - TaskList と TaskItem（nested 有効）を追加し、区切り線・基本装飾・リスト・引用の input rule を有効化する
  - editable フラグで差分のみ出し分け（公開時は Placeholder/Slash 非含・TaskItem 読取専用・Link は openOnClick）
  - ノード定義集合は editable に依らず一致させ、保存 HTML の往復一致を構造的に担保する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 7.1, 7.2, 7.3, 9.1_

- [ ] 1.4 createEditorExtensions の単体テスト
  - editable=true/false の出し分け（公開時 Placeholder/Slash 非含・TaskItem 読取専用）を検証する
  - 編集・公開でノード定義集合が一致し、保存 HTML が同一ノードへ復元されることをスナップショットで確認する
  - _Requirements: 5.4, 9.4_

- [ ] 2. content 同期の再設計（土台バグ修正・自動保存整合）
- [ ] 2.1 RichTextEditor を共有ファクトリへ接続し Mention 流用を除去
  - useEditor の extensions を createEditorExtensions({ editable:true, placeholder, slash }) へ置換する
  - `/` を流用していた Mention 拡張を除去し、ノートブック参照は後続のスラッシュコマンドへ移譲する前提を整える
  - 既存ツールバー操作・placeholder/autofocus/focusKey の props 契約を不変で維持する
  - _Requirements: 9.1, 9.5_

- [ ] 2.2 echo-ref 方式による content 同期ロジックの実装
  - 直近に emit した HTML を ref に保持し、content が一致する自己エコーは再適用しない
  - content が現在のエディタ内容と等価のときも再適用しない
  - 外部変更（別メモ切替・新規作成・サーバー再取得）のときのみ emitUpdate を抑止して content を反映する
  - タイプ中に content 全置換が走らないことで input rule の巻き戻しを防止する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 2.3 onChange 配線とフォーカス連携の維持
  - onUpdate で getHTML を ref へ保存しつつ onChange を発火し、既存の自動保存パイプラインへ接続する
  - 新規ノード（コードブロック・タスクリスト・区切り線・リンク）を含めて HTML 形式で出力する
  - 外部由来の content 反映単体では onChange を発火させず自動保存をスケジュールしない
  - onFocus/onBlur による useEditorFocusStore 更新とテーマエフェクト自動停止連携を維持する
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.3_

- [ ] 2.4 content 同期の単体・結合テスト
  - 自己エコー skip / 等価 skip / 外部変更時のみ emitUpdate 抑止反映の分岐を検証する
  - onUpdate→ref→onChange→親 setContent→sync skip の一巡で保存ループが発生しないことを確認する
  - 変換直後の Undo が Markdown 記法テキストへ戻ることを確認する
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.9, 8.4_

- [ ] 3. スラッシュコマンドメニュー（ノートブック参照との共存）
- [ ] 3.1 SlashCommand 拡張のトリガーと抑止制御
  - suggestion ベースの専用拡張を作成し、空または行頭での `/` 入力でメニューを起動する
  - allow 判定でコードブロック内ではメニューを表示しない
  - コマンド確定時に `/` とクエリ文字列を削除した上で挿入処理を実行する
  - _Requirements: 3.1, 3.4, 3.7_

- [ ] 3.2 (P) スラッシュコマンド定義とクエリ絞り込み
  - 見出し H1〜H3・箇条書き・番号付き・引用・コードブロック・チェックリスト・区切り線・ノートブック参照の既定コマンドを提供する
  - クエリ文字列でコマンド候補を前方一致・部分一致で絞り込む純関数として実装する
  - 各ブロック挿入結果が既存ツールバー操作と同一のノード構造になることを保証する
  - _Requirements: 3.2, 3.3, 2.10_

- [ ] 3.3 (P) SlashCommandList UI の作り直し
  - 冒頭の TODO を解消し、候補リスト・上下キー移動・Enter 確定・クリック選択・Escape クローズを提供する
  - 候補なしクエリで候補なし表示または自動クローズを行う
  - ノートブック絞り込み用のサブメニュー表示と「戻る」操作を props で受ける
  - 既存の forwardRef + useImperativeHandle(onKeyDown) によるキーボード連携構造を踏襲する
  - _Requirements: 3.6, 3.8_

- [ ] 3.4 root↔notebook モード遷移とノートブック参照挿入の統合
  - ノートブック参照コマンド選択時は挿入も range 削除も行わずサブメニューへ遷移する（mode は render/UI 層が保持し doc を汚さない）
  - ノートブック確定時に初めて range を削除し `[[ノートブック名]]` をプレーンテキストで挿入する
  - Backspace で `/` まで消去・Escape・候補なしのとき mode を戻すかメニューを閉じる
  - 既存の notebooksData 注入機構を流用してノートブック参照の非回帰を維持する
  - _Requirements: 3.2, 3.5, 9.2_

- [ ] 3.5 スラッシュコマンドの単体・E2E テスト
  - クエリ絞り込み・既定コマンド網羅・サブメニュー絞り込みを検証する
  - 上下/Enter/Esc/クリック・候補なし表示・コードブロック内非表示を検証する
  - `/` 起動→ブロック挿入、ノートブック参照→`[[name]]` 挿入の往復を E2E で網羅する
  - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 4. (P) PublicMemoRenderer を共有ファクトリへ移行
  - extensions を createEditorExtensions({ editable:false }) へ置換し、編集側と同一ノード定義で描画する
  - editable:false・pointer-events-none select-text の既存表示属性を維持する
  - 新規ノード（コードブロック・タスクリスト・区切り線・リンク）を崩さず公開表示でレンダリングする
  - タスク1完了に依存（共有ファクトリ必須）。タスク3とはファイル境界が分かれるため並列実行可
  - _Requirements: 9.4_

- [ ] 5. 統合検証（保存往復・非回帰）
- [ ] 5.1 保存 HTML 往復の結合テスト
  - タスクリストの data-checked とコードブロックの言語 class が再読込で保持されることを確認する
  - 見出し・リスト・装飾・区切り線・リンク・ノートブック参照を含む保存前後のノード構造一致を確認する
  - _Requirements: 4.5, 5.4, 8.3_

- [ ] 5.2 主要シナリオの E2E テスト
  - `# ` 即時 H1 変換と、続けてタイプしても巻き戻らないことを確認する
  - `/` メニューからのブロック挿入、コードブロック内での非表示を確認する
  - 別メモ切替での外部 content 反映と、その単体で自動保存が走らないことを確認する
  - 公開表示でコードブロック/タスクリスト/区切り線/リンクが崩れず描画されることを確認する
  - _Requirements: 1.1, 1.2, 1.4, 3.1, 3.4, 3.7, 8.4, 9.4_

- [ ] 5.3 既存機能の非回帰確認とリント・型チェック
  - ツールバーボタン（太字・斜体・取消線・H1・H2・箇条書き・番号付き・引用）の従来動作を確認する
  - ノートブック参照 Mention 相当機能とテーマフォーカス連携の維持を確認する
  - ESLint・TypeScript 型チェック（any 禁止則遵守）を通過させる
  - _Requirements: 9.1, 9.2, 9.3, 9.5_
