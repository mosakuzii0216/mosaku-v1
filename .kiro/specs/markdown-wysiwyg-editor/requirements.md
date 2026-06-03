# Requirements Document

## Project Description (Input)

TipTap エディタの Markdown WYSIWYG 入力体験を強化する。現状、StarterKit を使っているが「# 」等の Markdown ショートカット（input rules）を打っても変化しない不具合がある。原因仮説は RichTextEditor.tsx の content 同期 useEffect（editor.commands.setContent）がタイプ中に走り ProseMirror のトランザクションをリセットして input rules の成立を阻害している点。この土台バグ修正を最優先に、基本 Markdown ショートカット（見出し/箇条書き/番号付き/引用/強調/取消線）の網羅、/ スラッシュコマンドによるブロック挿入メニュー（既存の / トリガー = ノートブック参照 Mention との共存設計が論点）、コードブロック（シンタックスハイライト）、チェックリスト、区切り線、リンク自動化を段階的に追加し、Notion/Bear のようなリッチな入力体験を実現する。自動保存（編集停止2秒・HTML保存）との整合も考慮する。詳細なブレスト結果は .kiro/steering/20260602-markdown-wysiwyg-editor/brainstorm.md を参照。

## Introduction

本仕様は、Mosaku のリッチテキストエディタ（`frontend/src/components/editor/RichTextEditor.tsx`、TipTap + StarterKit）における Markdown WYSIWYG 入力体験を強化する。現状、Markdown の input rules（`# `→見出し等）がタイプ中に成立しない不具合があり、これは content 同期 `useEffect`（`editor.commands.setContent`）がタイプ中に ProseMirror トランザクションを巻き戻している点が有力な原因である。

本機能は次の方針で段階的に価値を届ける。

1. **土台のバグ修正**（input rules を成立させる content 同期の見直し）を最優先とする。
2. その上で **基本 Markdown ショートカット網羅**、**スラッシュコマンドメニュー**、**コードブロック / チェックリスト / 区切り線 / リンク自動化** を順に追加し、Notion / Bear のようなリッチな入力体験へ近づける。
3. 既存の自動保存（編集停止後・既定 debounce 実効約 200ms・HTML 保存）、ノートブック参照（`/` トリガーの Mention → `[[name]]`）、テーマエフェクトのフォーカス連携を **壊さない（非回帰）** ことを必須とする。

本機能は WHAT（書き心地と挙動）を定義し、HOW（拡張の実装方式やライブラリ選定）は design フェーズで決定する。

### 用語定義

- **input rules**: タイプ中の文字列パターン（例: `# `、`- `、`> `）を検知してノードへ自動変換する ProseMirror / TipTap の仕組み。
- **スラッシュコマンドメニュー**: `/` 入力で開くブロック挿入用のコマンドパレット。
- **ノートブック参照**: 既存の `/` トリガー Mention が挿入する `[[ノートブック名]]` 形式の参照。
- **エディタ**: 本仕様の対象である Markdown WYSIWYG エディタ（`RichTextEditor`）。

## Requirements

### Requirement 1: input rules 復活（土台バグ修正）

**Objective:** メモを書くユーザーとして、`# ` などの Markdown ショートカットをタイプした瞬間に変換されてほしい。そうすれば手を止めずに構造化された文章を書けるから。

#### Acceptance Criteria

1. When ユーザーが空段落の行頭で `# ` を入力したとき, the エディタ shall その段落を見出し（H1）へ即座に変換する。
2. When ユーザーが Markdown input rule に一致する文字列をタイプしたとき, the エディタ shall その変換のトランザクションを巻き戻さず維持する。
3. While ユーザーがエディタ内でタイプしているとき, the エディタ shall `editor.commands.setContent` による content 全置換を実行しない。
4. When 外部要因（別メモへの切り替え・新規作成・サーバー再取得）で `content` プロパティが現在のエディタ内容と異なる値に変化したとき, the エディタ shall その新しい content をエディタへ反映する。
5. When 外部要因で content をエディタへ反映するとき, the エディタ shall その反映を `onChange` / 自動保存の再トリガー対象としない（保存ループを発生させない）。
6. If `content` プロパティの値が現在のエディタ内容と等価であるとき, then the エディタ shall content の再適用を行わない。

### Requirement 2: 基本 Markdown ショートカット網羅

**Objective:** メモを書くユーザーとして、見出し・リスト・引用・装飾を Markdown 記法のタイプだけで適用したい。そうすればツールバーへマウスを動かさず執筆に集中できるから。

#### Acceptance Criteria

1. When ユーザーが行頭で `# ` / `## ` / `### ` を入力したとき, the エディタ shall それぞれ H1 / H2 / H3 見出しへ変換する。
2. When ユーザーが行頭で `- ` または `* ` を入力したとき, the エディタ shall 箇条書きリストへ変換する。
3. When ユーザーが行頭で `1. ` を入力したとき, the エディタ shall 番号付きリストへ変換する。
4. When ユーザーが行頭で `> ` を入力したとき, the エディタ shall 引用ブロックへ変換する。
5. When ユーザーが `**テキスト**` または `__テキスト__` を入力したとき, the エディタ shall 該当範囲を太字へ変換する。
6. When ユーザーが `*テキスト*` または `_テキスト_` を入力したとき, the エディタ shall 該当範囲を斜体へ変換する。
7. When ユーザーが `~~テキスト~~` を入力したとき, the エディタ shall 該当範囲を取消線へ変換する。
8. When ユーザーが `` `テキスト` `` を入力したとき, the エディタ shall 該当範囲をインラインコードへ変換する。
9. When ユーザーが変換直後に Undo（Ctrl/Cmd+Z）を実行したとき, the エディタ shall 変換前の Markdown 記法テキストへ戻す。
10. The エディタ shall 既存ツールバー（太字・斜体・取消線・H1・H2・箇条書き・番号付き・引用）の操作結果と Markdown ショートカットの変換結果を同一のノード構造にする。

### Requirement 3: スラッシュコマンドメニュー（ノートブック参照との共存）

**Objective:** メモを書くユーザーとして、`/` を押すとブロック挿入メニューが開き、見出し・リスト・コードブロック等をすばやく挿入したい。同時に既存のノートブック参照も引き続き使いたい。

#### Acceptance Criteria

1. When ユーザーが空または行頭で `/` を入力したとき, the エディタ shall ブロック挿入候補を含むスラッシュコマンドメニューを表示する。
2. The スラッシュコマンドメニュー shall 少なくとも見出し（H1〜H3）・箇条書き・番号付き・引用・コードブロック・チェックリスト・区切り線・ノートブック参照のコマンドを提供する。
3. When ユーザーが `/` に続けて文字を入力したとき, the スラッシュコマンドメニュー shall 入力文字でコマンド候補を絞り込む。
4. When ユーザーが候補を選択（Enter またはクリック）したとき, the エディタ shall `/` とクエリ文字列を削除した上で対応するブロックを挿入する。
5. When ユーザーがノートブック参照コマンドを選択しノートブックを確定したとき, the エディタ shall 既存仕様どおり `[[ノートブック名]]` を挿入する。
6. While スラッシュコマンドメニューが表示されているとき, the メニュー shall 上下キーで候補移動・Enter で確定・Escape で閉じる操作を提供する。
7. If `/` 入力位置がコードブロック内であるとき, then the エディタ shall スラッシュコマンドメニューを表示しない。
8. When スラッシュコマンドメニューが開いた状態でユーザーが該当する候補のないクエリを入力したとき, the メニュー shall 候補なしを示すか自動的に閉じる。

### Requirement 4: コードブロック（シンタックスハイライト）

**Objective:** 技術メモを書くユーザーとして、コードを等幅・シンタックスハイライト付きで記録したい。そうすればコード断片を読みやすく保存できるから。

#### Acceptance Criteria

1. When ユーザーが行頭で ` ``` ` を入力したとき, the エディタ shall コードブロックへ変換する。
2. While キャレットがコードブロック内にあるとき, the エディタ shall Markdown input rules（見出し・リスト等）を適用しない。
3. Where コードブロックに言語が指定されているとき, the エディタ shall その言語に応じたシンタックスハイライトを適用する。
4. When ユーザーがコードブロック内で Enter を押したとき, the エディタ shall コードブロックを抜けずに改行を挿入する。
5. The エディタ shall コードブロック内のテキストを HTML 保存・再読込後も等幅・ハイライト可能な構造で保持する。

### Requirement 5: チェックリスト（タスクリスト）

**Objective:** ToDo を書くユーザーとして、チェックボックス付きリストを作り、完了をクリックで切り替えたい。

#### Acceptance Criteria

1. When ユーザーが行頭で `[ ] ` または `[] ` を入力したとき, the エディタ shall チェックボックス付きのタスクリスト項目へ変換する。
2. When ユーザーがチェックボックスをクリックしたとき, the エディタ shall その項目の完了状態をトグルする。
3. When ユーザーがタスクリスト項目末尾で Enter を押したとき, the エディタ shall 未チェックの新規タスク項目を追加する。
4. The エディタ shall タスクリストの完了状態を HTML 保存・再読込後も保持する。

### Requirement 6: 区切り線（水平線）

**Objective:** 長文を書くユーザーとして、セクションを区切る水平線を素早く挿入したい。

#### Acceptance Criteria

1. When ユーザーが行頭で `---` を入力したとき, the エディタ shall 水平線（区切り線）を挿入する。
2. When 水平線が挿入されたとき, the エディタ shall キャレットを水平線直後の新しい段落へ移動する。

### Requirement 7: リンク自動化

**Objective:** メモを書くユーザーとして、URL を入力・貼り付けたら自動でリンク化されてほしい。

#### Acceptance Criteria

1. When ユーザーが URL 文字列を入力し直後に空白または改行を入力したとき, the エディタ shall その URL をクリック可能なリンクへ変換する。
2. When ユーザーがテキストを選択した状態で URL をペーストしたとき, the エディタ shall 選択テキストをその URL のリンクにする。
3. When ユーザーがリンク化された URL の末尾で編集を続けたとき, the エディタ shall リンク範囲を意図せず後続テキストへ拡張しない。

### Requirement 8: 自動保存との整合

**Objective:** メモを書くユーザーとして、Markdown 入力で生成された内容も従来どおり安全に自動保存してほしい。

#### Acceptance Criteria

1. When ユーザーの入力により Markdown ショートカット・スラッシュコマンドでエディタ内容が変化したとき, the エディタ shall `onChange` を発火し、既存の自動保存パイプライン（`useAutoSave` の既定 debounce、実効約 200ms）に基づき編集停止後の自動保存をスケジュールする。
2. The エディタ shall 自動保存へ渡す内容を、新規ノード（コードブロック・タスクリスト・区切り線・リンク）を含めて HTML 形式で出力する。
3. When 自動保存が完了した内容を再読込したとき, the エディタ shall 保存前と同じノード構造（見出し・リスト・装飾・コードブロック・タスクリスト・区切り線・リンク・ノートブック参照）を復元する。
4. If 外部由来の content 反映（Requirement 1.4）が発生したとき, then the エディタ shall その反映単体では自動保存をスケジュールしない。

### Requirement 9: 既存機能の非回帰

**Objective:** 既存ユーザーとして、エディタ強化後も従来のノートブック参照・ツールバー・表示・テーマ連携が壊れないでほしい。

#### Acceptance Criteria

1. The エディタ shall 既存のツールバーボタン（太字・斜体・取消線・H1・H2・箇条書き・番号付き・引用）を従来どおり機能させる。
2. The エディタ shall 既存のノートブック参照 Mention（`/` → `[[ノートブック名]]`）を従来どおり機能させる。
3. When エディタがフォーカス・ブローされたとき, the エディタ shall `useEditorFocusStore` のフォーカス状態を従来どおり更新し、テーマエフェクトの自動停止連携を維持する。
4. When メモ・ノートブックの公開表示（`PublicMemoRenderer`）が本機能で保存された HTML を読み込むとき, the 公開表示 shall 内容を破綻なくレンダリングする。
5. The エディタ shall `placeholder`・`autofocus`・`focusKey` による初期フォーカス挙動を従来どおり維持する。
