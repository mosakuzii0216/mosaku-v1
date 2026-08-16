# Research Log: editor-prose-typography

## Summary

- **Discovery scope**: Light（Extension）。gap-analysis.md で現状調査済み。本ログは外部依存（`@tailwindcss/typography`）のバージョン確定と、3つの設計判断（override 置き場所 / max-width / 視覚検証方式）の根拠を記録する。
- **Key findings**:
  - `@tailwindcss/typography@0.5.19`（最新）は peer `tailwindcss: >=3.0.0` で現行 v3.4.17 と互換。`^0.5.19` で pin。
  - prose の要素スタイルは `:where()` ベースで **specificity 0**。既存 `codeHighlight.css`（`.rich-text-editor pre` 等 = specificity 0,1,1）が無条件に勝つため、コードブロック配色は維持される。
  - prose の既定副作用（inline code のバッククォート擬似要素 / `max-width:65ch` / taskList へのバレット）は typography の `css` 設定で集中的に無効化できる。editor/public は同一 `prose` クラスを共有しているため、config 一箇所の調整で対称適用される。

## Research Log

### Topic 1: @tailwindcss/typography のバージョン互換

- **調査**: `npm view @tailwindcss/typography version peerDependencies`
- **結果**: `version = 0.5.19`、`peerDependencies.tailwindcss = ">=3.0.0 || ... || >=4.0.0-beta.1"`
- **含意**: 現行 Tailwind v3.4.17 に対し追加の破壊なく導入可能。devDependency に `@tailwindcss/typography@^0.5.19` を追加し `tailwind.config.js` の `plugins` に `require('@tailwindcss/typography')` を登録する。ESM 設定ファイル（`export default`）のため `import typography from '@tailwindcss/typography'` 形式を design で指定。

### Topic 2: prose と codeHighlight.css の競合可否

- **調査**: typography のセレクタ方式（`.prose :where(pre):not(:where([class~="not-prose"] *))`）と既存 `codeHighlight.css` のセレクタ（`.rich-text-editor pre` / `.public-memo-renderer pre`）の specificity 比較。
- **結果**: typography 側 `:where()` は specificity 0。codeHighlight 側は要素+クラスで 0,1,1。**codeHighlight が勝つ**。
- **含意**: コードブロックの配色・角丸・余白は現状維持。ただし prose の `code`（inline）バッククォート擬似要素・`pre` のデフォルト余白が二重に乗らないよう、typography `css` で `code::before/::after { content: none }`、`pre`/`code` の `background/color/padding` を `unset` 相当に無効化する（codeHighlight 配下の `pre` はそのまま codeHighlight が再付与）。

### Topic 3: 設計判断3点

1. **override 置き場所** → `tailwind.config.js` の `theme.extend.typography`（CSS-in-JS）。理由: editor/public が同一 `prose` クラスを共有するため、config 一箇所で**対称適用**でき Req3 を構造的に満たす。`codeHighlight.css`（hljs トークン配色）はスコープ CSS のまま据え置き（役割が別・specificity で勝つ）。
2. **max-width** → `maxWidth: 'none'`（65ch 制限を解除）。理由: 現行レイアウト（コンテナ幅いっぱい）を維持し、本修正のスコープを「ブロック要素の視覚化」に限定。中央寄せ化による回帰を避ける。`mx-auto` は全幅時に無害なので既存クラス据え置き。
3. **視覚検証方式** → 2層。(a) typography プラグインが有効である回帰ガード（config に typography が登録されていること、または生成 CSS に `.prose` 規則が含まれることの確認）。(b) Playwright で実描画 computed style を検証（見出し font-size > 段落、`ul`/`ol` の `list-style-type ≠ none`、blockquote に左罫線/パディング）。理由: jsdom はレイアウト計算しないため、「実描画の崩れ」は実ブラウザ検証でしか捕まらない（既存テストの盲点を埋める Req6.2/6.3）。

## Architecture Pattern Evaluation

- gap-analysis.md の Option C（プラグイン導入 + typography config によるスコープ override）を採用。Option B（プラグイン不使用の自前 CSS）は Req1 と不一致のため不採用。

## Risks

- **R1**: taskList の DOM 属性（`ul[data-type="taskList"]` / `li[data-checked]`）が TipTap のバージョン差で変わるとバレット抑止セレクタが外れる。→ 実装時に実 DOM を確認し、E2E でバレット非表示を検証。
- **R2**: prose のリンク色がテーマ背景で視認しづらい可能性。→ エディタ面を暗くするテーマは現状ゼロのため低リスク。リンク色は `inherit`/`text-gray-900` 系に寄せて回避可能。
- **R3**: `maxWidth:'none'` により将来「読みやすい幅に制限したい」となった場合は別 spec で再検討（本 spec の Non-Goal）。
