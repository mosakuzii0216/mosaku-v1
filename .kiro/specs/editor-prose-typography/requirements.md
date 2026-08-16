# Requirements Document

## Project Description (Input)

エディタと公開メモビューで見出し・箇条書き・番号付きリスト・引用ブロックが視覚的に崩れる問題を修正する。

### 背景・症状

WYSIWYG エディタ（`frontend/src/components/editor/RichTextEditor.tsx`）と公開メモレンダラ（`frontend/src/components/public/PublicMemoRenderer.tsx`）は、コンテンツ要素に Tailwind Typography の `prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl ...` クラスを付与している。しかし実機（ローカル dev・本番想定とも）で、`# ` 見出しや `- ` リスト、`> ` 引用を入力・表示すると、見出しは通常サイズのまま、リストは行頭記号なし、引用は装飾なしの「プレーンテキスト」に崩れる。保存される HTML 自体は `<h1>`/`<h2>`/`<ul><li>`/`<ol>`/`<blockquote>` と正しいノード構造になっており、input rules やスラッシュコマンド、コードブロックの構文ハイライト（専用 `codeHighlight.css` 由来）、太字/斜体/取消線のインライン装飾は正常に動作している。崩れるのはブロック要素の見た目のみ。

### 根本原因

frontend は Tailwind CSS v3（`tailwindcss ^3.4.17`、`index.css` は `@tailwind base/components/utilities` 形式）。`@tailwindcss/typography` プラグインが `package.json` に存在せず未インストールで、`tailwind.config.js` の `plugins` も `[]` で空。そのため editor / public で使っている `prose` 系クラスが一切スタイルを生成せず無効になっている。Tailwind preflight が h1〜h6・ul・ol・blockquote を素のスタイルにリセットするため、prose で上書きされないと全てプレーン表示になる。

### ゴール

友人共有（2026-06-30 目標）に向けて、WYSIWYG エディタの書き心地と共有メモの見栄えを「人に見せられる」レベルにする。差別化軸であるデザイン品質の土台を回復する。

## Introduction

本仕様は、Mosaku のリッチテキスト体験における **ブロック要素（見出し・箇条書き・番号付きリスト・引用ブロック）の視覚スタイル欠落** を解消する。対象は編集側（`RichTextEditor`）と公開側（`PublicMemoRenderer`）の双方であり、両者は同一の保存 HTML を同一の見た目で描画しなければならない。

本機能は WHAT（どのブロック要素がどう視覚的に区別されるべきか、テーマ/既存機能との非衝突）を定義し、HOW（プラグイン構成・CSS の具体的トークン値）は design フェーズで決定する。既存のノード構造（保存 HTML）・input rules・スラッシュコマンド・自動保存は本機能のスコープ外であり、変更しない（非回帰の対象）。

### 用語定義

- **prose スタイル**: `@tailwindcss/typography` が `prose` 系クラスに対して生成するブロック要素（見出し・リスト・引用等）のタイポグラフィスタイル。
- **エディタ**: 編集可能な WYSIWYG エディタ（`RichTextEditor`、`.ProseMirror` 要素）。
- **公開メモビュー**: 未ログイン閲覧者にも表示される読み取り専用レンダラ（`PublicMemoRenderer`）。
- **ブロック要素**: 見出し（H1〜H3）・箇条書きリスト（`ul`）・番号付きリスト（`ol`）・引用ブロック（`blockquote`）。
- **テーマ**: `frontend/public/themes/{category}/{name}.css` の CSS 変数で色・タイポグラフィを定義する仕組み。

## Requirements

### Requirement 1: Typography プラグインの有効化

**Objective:** 開発者として、`prose` クラスが実際にスタイルを生成する状態にしたい。そうすればエディタ・公開ビューのブロック要素が崩れずに描画されるから。

#### Acceptance Criteria

1. The フロントエンドビルド shall `@tailwindcss/typography` プラグインを Tailwind 設定に登録した状態でビルドする。
2. The フロントエンドビルド shall `prose` クラスに対して見出し・リスト・引用のスタイル規則を含む CSS を生成する。
3. When `@tailwindcss/typography` のバージョンを選定するとき, the フロントエンド shall 現行の Tailwind CSS v3（`^3.4.17`）と互換なバージョンを採用する。
4. The フロントエンド shall 既存の Tailwind 設定（`content` グロブ・テーマ拡張・preflight）を破壊せずにプラグインを追加する。

### Requirement 2: エディタでのブロック要素の視覚化

**Objective:** メモを書くユーザーとして、`# ` や `- `、`> ` で作ったブロックが入力した瞬間に見た目で区別できてほしい。そうすれば「見出しにできた」と確信して手を止めずに書けるから。

#### Acceptance Criteria

1. While ユーザーがエディタで編集しているとき, the エディタ shall H1・H2・H3 見出しを本文段落と区別できるフォントサイズ・字面で表示する。
2. While ユーザーがエディタで編集しているとき, the エディタ shall 箇条書きリスト項目に行頭記号（バレット）を表示する。
3. While ユーザーがエディタで編集しているとき, the エディタ shall 番号付きリスト項目に連番の行頭番号を表示する。
4. While ユーザーがエディタで編集しているとき, the エディタ shall 引用ブロックを本文段落と区別できる装飾（インデントまたは罫線等）で表示する。
5. The エディタ shall 見出し・リスト・引用の視覚スタイルを、ツールバー操作・Markdown input rules・スラッシュコマンドのいずれで生成したノードに対しても等しく適用する。

### Requirement 3: 公開メモビューでのブロック要素の視覚化（編集側との一致）

**Objective:** 共有メモを受け取った閲覧者として、書き手が意図したとおりの構造（見出し・リスト・引用）で読みたい。そうすれば共有された内容が崩れず伝わるから。

#### Acceptance Criteria

1. When 公開メモビューが保存済み HTML（`<h1>`/`<ul>`/`<ol>`/`<blockquote>` を含む）を描画するとき, the 公開メモビュー shall 見出し・リスト・引用を視覚的に区別して表示する。
2. The 公開メモビュー shall 同一の保存 HTML に対して、エディタと視覚的に一致するブロック要素スタイルを適用する。
3. The 公開メモビュー shall 読み取り専用表示（`pointer-events-none` 等）を維持したままブロック要素スタイルを適用する。

### Requirement 4: 既存機能との非衝突

**Objective:** ユーザーとして、ブロック要素の修正によってコードブロックやチェックリスト等の既存表示が壊れてほしくない。

#### Acceptance Criteria

1. The エディタ and the 公開メモビュー shall コードブロックの既存構文ハイライト（`codeHighlight.css`）を prose 導入後も維持し、二重適用・スタイル競合を発生させない。
2. The エディタ shall タスクリスト（チェックリスト）の項目・チェックボックス表示を prose 導入後も維持する。
3. The エディタ and the 公開メモビュー shall 太字・斜体・取消線・インラインコードの既存インライン装飾を prose 導入後も維持する。
4. If prose のデフォルト要素スタイル（例: コードブロックや `pre` の背景・余白）が既存専用 CSS と競合するとき, then the フロントエンド shall 既存専用 CSS の表示を優先する。

### Requirement 5: テーマ・可読性との両立

**Objective:** ユーザーとして、どのテーマを使っていてもブロック要素が読みやすい色で表示されてほしい。デザインの美しさが Mosaku の価値だから。

#### Acceptance Criteria

1. The エディタ and the 公開メモビュー shall 現行の本文色（`text-gray-900`）を維持しつつブロック要素を表示する。
2. The フロントエンド shall prose のデフォルト文字色・見出し色・リンク色が既存テーマ（深緑ブランド等）および現行の背景と衝突して可読性を損なわないようにする。
3. Where テーマが CSS 変数で色・タイポグラフィを上書きしているとき, the エディタ and the 公開メモビュー shall prose スタイルがテーマの可読性を破壊しないように適用される。

### Requirement 6: 非回帰と視覚検証

**Objective:** 開発者として、この修正が既存テストを壊さず、かつ「実描画の崩れ」を今後も検知できるようにしたい。

#### Acceptance Criteria

1. The フロントエンド shall 既存の単体・E2E テストスイート（現状 747 件）を全て成功させる。
2. The 検証 shall 見出し・リスト・引用が視覚的に適用されること（prose クラスの有効化、または描画されたブロック要素のスタイル適用）を確認するテストを追加する。
3. The 追加テスト shall ノード構造（保存 HTML）のみを検証していた既存テストの盲点（実描画の崩れ）を埋める観点を含む。
4. The 検証 shall エディタと公開メモビューの双方でブロック要素スタイルが適用されることを対称に確認する。
