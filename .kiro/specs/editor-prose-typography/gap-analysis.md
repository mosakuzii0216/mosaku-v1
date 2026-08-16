# Gap Analysis: editor-prose-typography

作成日: 2026-06-05

承認済み要件（requirements.md, 6 エリア）と既存コードベースのギャップを分析し、design フェーズの意思決定材料を提供する。

## 1. 現状調査（Current State）

| 項目                      | 現状                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind                  | v3（`tailwindcss ^3.4.17`）、`index.css` は `@tailwind base/components/utilities`                                                                                                                                                     |
| `tailwind.config.js`      | `content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}']`、`darkMode: 'class'`、`theme.extend: {}`、**`plugins: []`（空）**                                                                                                            |
| `@tailwindcss/typography` | **未インストール**（package.json・node_modules とも無し）                                                                                                                                                                             |
| エディタ class            | `RichTextEditor.tsx:73` → `prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-full p-4 text-gray-900`、ラッパは `.rich-text-editor`（116行）                                                       |
| 公開 class                | `PublicMemoRenderer.tsx:17` → `prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto p-4 text-gray-900 pointer-events-none select-text`、ラッパは `.public-memo-renderer`（27行）                                              |
| コードハイライト          | `codeHighlight.css`（`createEditorExtensions.ts:9` で import）。セレクタは `.rich-text-editor pre` / `.public-memo-renderer pre` 等にスコープ済み。グローバルへ漏らさない設計                                                         |
| テーマ                    | `frontend/public/themes/{category}/{name}.css`。**エディタ面（`.rich-text-editor` / `.ProseMirror` / `.prose`）を暗くする/上書きするテーマCSSは存在しない**（grep で 0 件）。エディタ本文面は実質白サーフェス、本文色 `text-gray-900` |

**結論**: editor / public は既に同一の `prose` クラス文字列を付与しており、`createEditorExtensions` で拡張も共有済み。**欠けているのは「`prose` を実体化するプラグイン」のみ**。クラスの付け替えは原則不要。

## 2. 要件実現性と技術的ニーズ（Feasibility）

| 要件                  | 技術的ニーズ                                              | ギャップ/論点                                                                                                                        |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Req1 プラグイン有効化 | `@tailwindcss/typography` を devDep 追加 + `plugins` 登録 | Tailwind v3 互換版の選定（**Research**: `0.5.x` 系が v3 対応）                                                                       |
| Req2 エディタ視覚化   | `prose` 実体化で h1-h3/ul/ol/blockquote が描画            | クラス既存のため自動的に解決。ただし下記「衝突リスク」要処理                                                                         |
| Req3 公開一致         | 同上（同一クラス・同一拡張）                              | editor と public で **同一の override スコープ** を当てる必要                                                                        |
| Req4 既存非衝突       | code highlight / task list / inline marks 維持            | **衝突リスクあり（下記）**                                                                                                           |
| Req5 テーマ可読性     | prose のデフォ色がテーマと非衝突                          | エディタ面を暗くするテーマが無いためリスク低。リンク色・見出し色は要確認                                                             |
| Req6 非回帰+視覚検証  | 747 件維持 + 実描画検証テスト追加                         | jsdom はレイアウト計算しないため「サイズ」検証は不可。**Research**: 検証方式（クラス適用/Playwright 実描画/CSS生成物検査のいずれか） |

## 3. 衝突リスク（プラグイン有効化で新たに顕在化しうる点）

1. **インラインコードのバッククォート擬似要素**: `@tailwindcss/typography` は `code::before` / `code::after` に `` ` `` を `content` で付与する。現状の見た目（`<code>code</code>` のみ）に余計な記号が出る → 無効化が必要。
2. **`prose` の `pre` デフォルト配色 vs codeHighlight.css**: typography の `pre` はダーク配色だが、セレクタが `:where()` ベースで **specificity 0**。codeHighlight は `.rich-text-editor pre`（specificity 0,1,1）で勝つため**上書きは効くが、import 順・確実性を design で担保**する。
3. **`max-width: 65ch`（prose 既定）+ `mx-auto`**: 有効化後、本文幅が約 65ch に制限され中央寄せになる。現状（幅制限なし）からレイアウトが変わる → 意図する/しないを design で判断（`max-w-none` 解除 or 許容）。
4. **タスクリストのバレット**: prose は `ul > li` にバレットを付ける。TaskList の `li`（チェックボックス付き）に不要なバレットが出る可能性 → タスクリストのマーカー抑止が必要。
5. **見出し/リンク色**: prose は見出し・`strong`・リンクに固有色を当てる。`text-gray-900` 基調と整合するか、リンク色がテーマ背景で視認できるか確認。

## 4. 実装アプローチ案

### Option A: プラグイン導入のみ（最小）

`@tailwindcss/typography` 追加 + `plugins` 登録のみ。クラスは既存流用。

- ✅ 変更最小・要件1を直接満たす
- ❌ 衝突リスク（バッククォート/max-width/タスクバレット）が未処理で残る

### Option B: プラグインを使わずスコープ CSS を手書き

`codeHighlight.css` と同様に `.rich-text-editor` / `.public-memo-renderer` 配下へ h1-h3/ul/ol/blockquote の CSS を自前定義。`prose` クラスは撤去。

- ✅ 65ch/バッククォート等の prose 既定の副作用ゼロ・完全制御
- ❌ 要件1（プラグイン導入）と不一致。タイポgrafィを自前保守するコスト

### Option C（推奨）: プラグイン導入 + スコープ override

Option A に加え、`.rich-text-editor` / `.public-memo-renderer`（または `prose` の plugin config）で次を上書き: ①inline code バッククォート無効化 ②code block は codeHighlight 優先 ③タスクリストのバレット抑止 ④max-width の扱い決定。override は **editor/public 双方に対称適用**。

- ✅ 要件1を満たしつつ衝突を確実に解消・既存設計（スコープ CSS 文化）と一貫
- ❌ override の置き場所（plugin config の `typography` キー vs 専用 CSS）の判断が必要 → design で決定

## 5. Research Needed（design フェーズで確定）

- `@tailwindcss/typography` の Tailwind v3 互換バージョン pin（`0.5.x`）
- override の実装手段: `tailwind.config.js` の `theme.extend.typography`（CSS-in-JS）か、`codeHighlight.css` 流のスコープ CSS か
- `max-width` を解除（`max-w-none` 相当）するか 65ch を許容するか（UX 判断）
- 視覚検証テストの方式: prose クラス適用の単体検証 / Playwright 実描画（computed style）/ 生成 CSS への規則存在チェック
- タスクリストのマーカー抑止セレクタ（`li[data-checked]` 等、TaskItem の出力 DOM 構造に依存）

## 推奨

**Option C**。要件1がプラグイン導入を明示しており、かつ既存の「スコープ CSS で衝突回避」文化（codeHighlight.css）と整合する。design では override の置き場所・max-width 方針・検証方式の3点を確定する。
