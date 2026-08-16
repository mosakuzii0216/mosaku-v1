# Research & Design Decisions — editor-surface-tokenization

---

**Purpose**: design.md を支える調査記録。実測値・詳細度の勝敗・コントラスト計算など、design.md 本体に置くと可読性を損なう根拠をここに残す。

---

## Summary

- **Feature**: `editor-surface-tokenization`
- **Discovery Scope**: Extension（`design-discovery-light.md` を適用。外部ライブラリの新規追加が無く、既存 Layer① 語彙の縦展開であるため full discovery は不要と判断）
- **Key Findings**:
  1. **R-1 の結論が gap-analysis の想定を覆した**。tiptap v3 の `BubbleMenu` は `appendTo` 未指定時 `view.dom.parentElement` へ `appendChild` する（`@tiptap/extension-bubble-menu/dist/index.js:343-344`）＝ **in-tree**。body ポータルなのはスラッシュ候補（tippy `appendTo: () => document.body`）**だけ**。よって「Layer③ 到達不能」の面は 1 面に限定され、責務分離の書き方が単純化した。
  2. **G-1（テーマ源泉の二重化）は実在し、修正コストは小さい**。in-tree はシェルルート div の `data-theme={getEffectKey(useActiveTheme())}`（文脈テーマ優先）、body ポータルは `<html data-theme>`（localStorage シェル床）を見る。`applyCriticalTheme()` は冪等（適用前に critical 変数を必ずクリア）なので、**解決済みテーマで再適用する effect を 1 本足すだけ**で一本化できる。FOUC ゼロ設計（起動時同期適用）は無改変で維持される。
  3. **`disabled:opacity-50` は AA を大きく割る**（mori・白床 worst-case で **2.86:1**）。opacity 0.7 まで上げても 4.02 で未達。**前景色を `--on-surface-variant` へ切り替える案は 5.14:1 で成立**する。Req2.6 は「opacity をやめる」が唯一の解。
  4. **押下（`--state-selected`）とホバー（`--state-hover`）の面の差は 1.25:1 しかない**（mori 実測）。色（地）だけでは Req2.5 の「同一の見た目にならない」を満たせず、**境界色・文字色・font-weight の併用が必須**。
  5. **`--danger` / `--success` を「床の直上のテキスト」に使うと白床 worst-case で破綻する**（1.45 / 1.28）。`--surface` 系の面の上でのみ AA が成立（4.83 / 5.45）。トークン契約に「面の上でのみ有効」という前提条件を明記する必要がある。

---

## Research Log

### R-1: tiptap v3 `BubbleMenu` の DOM マウント位置

- **Context**: gap-analysis G-3 が「バブルメニューの最終 DOM 位置が未確認（in-tree ならば Layer③ も届く／ポータルなら届かない）」として、責務分離の書き方を保留していた。
- **Sources Consulted**:
  - `node_modules/@tiptap/extension-bubble-menu/dist/index.js`（v3.22.2）
  - `node_modules/@tiptap/react/dist/menus/index.js`
  - 呼び出し側 `frontend/src/components/editor/EditorBubbleMenu.tsx:52-57`
- **Findings**:
  - `extension-bubble-menu/dist/index.js:343-344`:
    ```
    const appendToElement = typeof this.appendTo === "function" ? this.appendTo() : this.appendTo;
    (appendToElement ?? this.view.dom.parentElement)?.appendChild(this.element);
    ```
    `appendTo` 未指定なら **`view.dom.parentElement`**（＝ProseMirror contenteditable の親＝`EditorContent` ラッパー）へ挿入する。
  - `react/dist/menus/index.js:454` は `createPortal(children, menuEl.current)` で、React 子要素を**その in-tree 要素**へ描画する（body ポータルではない）。
  - `EditorBubbleMenu.tsx` は `appendTo` を渡していない。
  - 位置決めは `@floating-ui/dom` の `computePosition`（`strategy` は既定 `absolute`）で、DOM 位置とは独立。
- **Implications**:
  - バブルメニューは `.rich-text-editor` → `.memo-content` → `.theme-root` の内側 ＝ **ツールバーと同じ層条件**。Layer① / Layer③ が両方届く。
  - 「Layer③ 到達不能」は**スラッシュ候補のみ**。gap-analysis G-3 の「ツールバーだけが両層に露出」は「ツールバー**とバブルメニュー**が両層に露出」へ修正される。
  - 結果として責務分離のルールは 2 面（in-tree 群 / ポータル 1 面）ではなく、**「操作面は全て Layer① が `color` を持ち切る」という単一ルール**で書ける。

### R-2: G-1 テーマ源泉の二重化（in-tree と body ポータル）

- **Context**: ポップオーバーだけ別テーマで描画される時限バグの疑い。
- **Sources Consulted**: `components/layouts/DesktopLayout.tsx:132-134` / `MobileLayout.tsx:120-122`、`hooks/useActiveTheme.ts`、`themes/shell/shellThemeCritical.ts:109-136`、`stores/useShellThemeStore.ts:35-42`、`themes/shell/shellThemeBoot.ts:15`、`components/editor/suggestion.ts:120-128`
- **Findings**:
  - **in-tree の源泉**: シェルルート div の `data-theme={getEffectKey(activeTheme)}`。`useActiveTheme()` の解決式は `notebookContextTheme ?? shellFloor ?? null`。
  - **ポータルの源泉**: `<html data-theme>`。書き込みは `applyCriticalTheme(slug)` のみで、呼び出し元は (a) `shellThemeBoot.ts:15`（起動時・localStorage 床）、(b) `useShellThemeStore.setShellTheme`（床の切替時）の 2 経路。**文脈テーマ（ノートブック/メモ）は `<html>` に反映されない**。
  - ⇒ 床 = mori・ノートブック = umi のとき、in-tree は `umi`、ポータルは `mori` を解決する。
  - 現状 umi/yoru/asa は tokens.css に値が無く両方とも `:root` 中立へ落ちるため**症状が出ない**。横展開スペックが値を入れた瞬間に顕在化する。
  - `applyCriticalTheme` は先頭で `CRITICAL_VAR_KEYS` と `background-color` を必ず `removeProperty` してから適用する＝**冪等**。同じ slug で再呼び出ししても副作用が無い。
  - `CRITICAL_THEME_VARS` は `umi/yoru/asa` が `{}`。未実装テーマでは `data-theme` 属性のみ付き、インライン critical 変数はゼロ＝Layer① の `:root` 中立へフォールバックする。これは in-tree 側の挙動と一致する。
- **Implications**:
  - 修正は「解決済みテーマ（`useActiveTheme` の結果）で `applyCriticalTheme` を再適用する effect を 1 本足す」だけで済む。既存関数の冪等性がそのまま安全弁になる。
  - 起動時の同期適用（FOUC ゼロ）は**先に走る**ため無改変。effect は post-mount の再整合に徹する。
  - 副次効果として `<html>` 背景（`--shell-base-bg`）も文脈テーマへ追随する。シェルルート div が既に文脈テーマで塗られている以上、これは**方針の変更ではなく不整合の解消**。

### R-3: Layer① の `--tw-prose-*` と Layer③ の見出し色の勝敗

- **Context**: Layer① で `--tw-prose-headings: currentColor` を敷くと Layer③ の見出し色（`mori.css`）と二重定義になるのではないか（Req5.3）。
- **Sources Consulted**: `node_modules/@tailwindcss/typography/src/styles.js:1413,1478`、`frontend/public/themes/mori/mori.css:69-80`、`hooks/useThemeCSS.ts:33`
- **Findings**:
  - typography v0.5.19 は `.prose` 本体に `color: 'var(--tw-prose-body)'`（styles.js:1413）、見出しは `.prose :where(h1):not(:where([class~="not-prose"] *))` に `color: 'var(--tw-prose-headings)'`（:1478）を敷く。`:where()` は詳細度 0 なので**実効詳細度は (0,1,1)**。
  - Layer③ は `.theme-root .memo-content h1` を `useThemeCSS.ts:33` が `[data-theme-id="<id>"] .memo-content h1` へ書き換えて注入する ＝ **(0,2,1)**。
  - ⇒ **テーマ適用時は Layer③ が勝つ**。`--tw-prose-headings: currentColor` は「prose が持つハードコード色（slate-900 等）を無効化する」だけで、テーマ時の見出し色を**決めない**。
- **Implications**:
  - `--tw-prose-*: currentColor` は**色の定義ではなく、prose 組み込みパレットの脱色（de-definition）**として位置づけられる。Req5.3（同一プロパティを両層で定義しない）に抵触しない。design.md にこの位置づけを明記する。
  - 中立時（Layer③ 不在）は `currentColor` が効き、見出しが本文と同じ色系統になる。これは Req4.3 の要求そのもの。

### R-4: `text-gray-900` 除去後の中立フォールバックの着地先

- **Context**: Req4.4 / 8.1 の「実装前と同等の中立配色」を厳密に満たせるか。
- **Sources Consulted**: `frontend/src/index.css:15-23`（body ルール）、`frontend/src/themes/shell/tokens.css:33`、`components/memo/MemoEditor.tsx:401`、`components/notebook/NotebookEditor.tsx:341`
- **Findings**:
  - `index.css` の `body` ルールには **`color` プロパティが無い**（margin / font-family / font-smoothing のみ）。
  - Layer①（index.css / tokens.css / primitives.css）に `.memo-content { color }` は**存在しない**。定義しているのは Layer③ の `.theme-root .memo-content` だけ。
  - ⇒ `text-gray-900` を外しただけでは、中立時に UA 既定色（`#000`）へ落ちる。現行 `#111827` とは別値。
  - `tokens.css:33` の `--on-surface: #111827` は **Tailwind gray-900 と完全一致**＝現行 `text-gray-900` の値そのもの。
  - `.memo-content` は `MemoEditor.tsx:401` と `NotebookEditor.tsx:341` の 2 箇所のラッパー div にのみ付与されている。
- **Implications**:
  - gap-analysis の対策 (a)（Layer① に素の `.memo-content` 相当の `color` を置く）が正解。ただし `primitives.css.test.ts:194-208` が「トップレベルセレクタは `.shell-*` / `.app-shell` のみ」を強制するため、`.memo-content` を直接書けない。
  - ⇒ **同じラッパー div に `.shell-prose-host` を併記**し、`.shell-prose-host { color: var(--on-surface) }` とする。詳細度 (0,1,0) なので Layer③ の (0,2,0) が常に勝ち、本文面の所有権は Layer③ に残る（Req1.5 / 5.2）。中立時は `#111827` に解決され現行と完全一致（Req4.4 / 8.1）。
  - `.ProseMirror` に `color` を**直接**書く案は Layer③ を殺すため不採用（gap-analysis G-4 の (c)）。ただし `color: inherit` は「親に従う」の明示であり、`.prose { color: var(--tw-prose-body) }` を打ち消す目的でのみ使う（(0,2,0) > (0,1,0)）。

### R-5: `disabled` 表現の実効コントラスト

- **Context**: Req2.6「判読可能な最小コントラストを下回らない」。現行は `disabled:opacity-50`。
- **Method**: `themes/contrast.ts` と同じ合成式（`result = α·fg + (1−α)·floor`）で、mori の半透明 `--surface`（`rgba(6,38,22,0.74)`）を通常床（`#062616`）と worst-case 白床（`#ffffff`）に合成し、その上に opacity を掛けた前景を再合成して計測。
- **Findings**:

  | 案                                             | 通常床 | 白床 worst-case | 判定 |
  | ---------------------------------------------- | -----: | --------------: | ---- |
  | `--on-surface` @ opacity 0.5（現行相当）       |   4.61 |        **2.86** | ❌   |
  | `--on-surface` @ opacity 0.6                   |   6.03 |        **3.41** | ❌   |
  | `--on-surface` @ opacity 0.7                   |   7.72 |        **4.02** | ❌   |
  | 前景を `--on-surface-variant`（#bfe6d0）へ切替 |  11.91 |        **5.14** | ✅   |

- **Implications**: opacity による減衰は白床 worst-case で必ず破綻する。**`.shell-button:disabled` は opacity を使わず前景色を `--on-surface-variant` へ切り替える**。非色の手がかりは `disabled` 属性（ネイティブに支援技術へ露出）＋ `cursor: not-allowed`。

### R-6: Req8.2「バンドル不増」の測定可能な定義

- **Context**: Layer①（tokens.css / primitives.css）は全ユーザーへ配られるため、文字どおりの「不増」は達成不能。
- **Sources Consulted**: `tokens.css:14-20`（層所有コメント）、`primitives.css:13-25`、`frontend/src/themes/codeSplitVerification.test.ts`、`.kiro/steering/tech.md`（テーマエフェクトのコード分割方針）
- **Findings**:
  - リポジトリにバンドル**サイズ**の自動ガードは存在しない。`codeSplitVerification.test.ts` はエフェクトの動的 import 分割（チャンク独立性）を検証するもので、バイト数は見ていない。
  - theme-immersive-world の運用解釈は tokens.css / primitives.css の冒頭コメントに明文化済み ＝「**重量物（テクスチャ画像・data-URI noise・テーマ固有装飾）を Layer① に置かない**」＋「JS チャンクを増やさない」。
- **Implications**: Req8.2 を次の 3 条件へ翻訳し、全て機械検証可能にする。
  1. **新規 JS 依存ゼロ**（`frontend/package.json` の `dependencies` 差分ゼロ）
  2. **Layer① への追加は宣言のみ**：`data:` URI / `url(` / `@font-face` / `@import` を含まない（`primitives.css.test.ts` の禁止リテラル検査を拡張）
  3. **非森テーマで追加ネットワークリクエストゼロ**（Layer③ の fetch 契約は無改変）

### R-7: 新 E2E でバブルメニューを安定して開けるか

- **Context**: Req8.4 の E2E 対象範囲の確定。
- **Sources Consulted**: `frontend/e2e/display-mode-theme.spec.ts`（バックエンド全面モック）、`frontend/e2e/slash-command.spec.ts`（実バックエンド依存）、`components/editor/EditorBubbleMenu.tsx:15-23`（`shouldShow`）
- **Findings**:
  - `display-mode-theme.spec.ts` は `page.route` で backend を全面モックし、`getComputedStyle` を評価する完成テンプレ。`FAKE_JWT`（exp 未来）と `/auth/refresh` の `{ accessToken, user }` が必須という落とし穴も記録済み。
  - スラッシュ候補は静的な項目集合（ノートブック参照だけが `setNotebooksData` 依存）なので、モック環境で `/` を打つだけで開く。
  - バブルメニューは `shouldShow` がテキスト選択 or 表/コールアウト内キャレットを要求する。Playwright でのテキスト選択は ProseMirror の座標依存で不安定になりやすい。
  - `tippy.js` の CSS（`tippy.js/dist/tippy.css`）は**どこからも import されていない**。`.tippy-box` に既定の地色が無いため、浮遊面の見た目は `SlashCommandList` 自身の div が 100% 決めている。
- **Implications**: E2E（Req8.4）は **ツールバー ＋ スラッシュ候補**を対象にする。バブルメニューは同一の共有クラス（`SWATCH_BUTTON_CLASS` → `.shell-button`）を使うため、**ユニットテストの className アサーション**で回帰を捕まえる。E2E の不安定要因を持ち込まない。

### 実測インベントリの再確認（生 Tailwind 配色ユーティリティ）

`bg-|text-|border-|ring-|placeholder-|divide-` × 色名の出現数（本セッションで再計測）:

| ファイル                      |    実測 | 構造上の集約点                                     |
| ----------------------------- | ------: | -------------------------------------------------- |
| `editor/RichTextEditor.tsx`   |      58 | 8 ボタンが完全同型（共通ヘルパへ抽出可能）         |
| `memo/MemoPalette.tsx`        |      29 | スクリム 1 ＋ パネル 1 ＋ 行 2 種                  |
| `memo/ShareMemoControl.tsx`   |      22 | 緑（成功/共有中）・赤（破壊）・メニュー面          |
| `memo/TrashView.tsx`          |      18 | 赤（破壊）・青（復元）・リスト行                   |
| `memo/MemoSearch.tsx`         |      11 | 入力 1 本（`.shell-field` で解決）                 |
| `memo/MemoEditor.tsx`         |      10 | 保存（accent）・削除（danger）・ヘッダー境界       |
| `editor/SlashCommandList.tsx` |       9 | 浮遊面 1 ＋ 行 1 ＋ 補助テキスト                   |
| `editor/EditorBubbleMenu.tsx` |       7 | `SWATCH_BUTTON_CLASS` 1 定数に 27 ボタンが集約済み |
| **計**                        | **164** |                                                    |

`editor/codeHighlight.css` は生カラーリテラル **13 個 / `var()` 0 個**。`callout.css` は `var()` 4 / 生 0、`table.css` は両方 0（健全）。

**既存ユニットテストの有無**: `MemoPalette` / `MemoSearch` / `TrashView` は**テストファイルが存在しない**（`RichTextEditor` / `EditorBubbleMenu` / `SlashCommandList` / `MemoEditor` / `ShareMemoControl` は存在）。`RichTextEditor.test.tsx` は `prose` / `prose-sm` / `sm:prose-base` / `lg:prose-lg` / `xl:prose-xl` の存在をアサートしているため、`text-gray-900` のみを除去し prose 系文字列は温存する必要がある。

---

## Architecture Pattern Evaluation

| Option                                                                | Description                                                                                               | Strengths                                                                                                                                                                          | Risks / Limitations                                                                                                                                                                                               | 判定                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **A. 既存プリミティブのみで押し切る**                                 | `.shell-button` / `.shell-panel` / `.shell-text-muted` を貼るだけ。押下は `.is-active` を流用             | 追加ゼロ・最速。Req8.2 の解釈論争が起きない                                                                                                                                        | Req2.1 が「押下状態を質感プリミティブとして質感層に備える」と明示要求しており未充足。`:disabled` 未定義（2.6）・浮遊面の elevation とスクリム無し（3.2）・二次対象の破壊/成功を表現できず Req1.2 を落とすしかない | ❌ 要件未充足         |
| **B. エディタ専用レイヤー新設**（`editorSurface.css` ＋ `.editor-*`） | エディタ固有の要求を独立語彙で表現                                                                        | 自由度が高く玄関の `.shell-*` を汚さない                                                                                                                                           | **Req1.3「面ごとの専用クラスを新設しない」に正面から抵触**。`.shell-button` と `.editor-button` が同じ見た目を二重定義＝Req5.3 違反。語彙が 2 系統になり横展開スペック（Req7）が両方を面倒見る                    | ❌ 要件が明示的に禁止 |
| **C. Layer① 語彙の最小拡張 ＋ in-place 置換**                         | `tokens.css` に 9 役割、`primitives.css` に 5 クラス群を足し、8 ファイルの className をトークン駆動へ置換 | 全 Requirement に素直に対応。新プリミティブは追加した瞬間に既存ガード（リテラル禁止・`.shell-*` 限定）が自動適用。テーマ名をコードに書かないので Req7 の「値供給だけで波及」を維持 | 新役割 9 個ぶんのコントラスト検証が付随。G-1 の修正が `<html data-theme>` の書き込み経路に触れる                                                                                                                  | ✅ **採用**           |

**採用理由**: Req1.3 が B を明示的に禁じ、Req2.1 / 2.6 / 3.2 が A の充足範囲を超える。C は既存の 3 層構造（Layer①/②/③）と「役割名は 4 テーマ共通・値だけ差し替え」という契約を一切変えずに縦展開する唯一の選択肢。

### スコープ変種の検討（Req1.2 の解釈）

| 変種                     | 対象                                     |      新トークン役割 | 判定                                                               |
| ------------------------ | ---------------------------------------- | ------------------: | ------------------------------------------------------------------ |
| C1 一次のみ              | 中核 3 面                                | 1（`--scrim` 不要） | requirements Req1.2 が二次対象を明示列挙しているため要件改訂が必要 |
| C2 一次 ＋ 浮遊面        | ＋ MemoPalette / MemoSearch / MemoEditor |                   3 | 同上（TrashView / ShareMemoControl が落ちる）                      |
| **C3 requirements 全文** | ＋ TrashView / ShareMemoControl          |               **9** | ✅ **採用**。承認済み requirements の文面をそのまま満たす          |

---

## Design Decisions

### Decision 1: 浮遊面のテーマ源泉を「解決済みテーマ」へ一本化する

- **Context**: R-2 の通り、body ポータル（スラッシュ候補）だけが `<html data-theme>` ＝ localStorage シェル床を見ており、文脈テーマ（ノートブック/メモ）と食い違う。横展開スペックが umi/yoru/asa に値を入れた瞬間に「ポップオーバーだけ別テーマ」が顕在化する。
- **Alternatives Considered**:
  1. **ポータル側を `.theme-root` へ寄せる** — tippy の `appendTo` を `() => document.querySelector('.theme-root') ?? document.body` に変える。
  2. **`<html data-theme>` を解決済みテーマで再適用する** — `useActiveTheme()` の結果で `applyCriticalTheme` を呼ぶ effect を足す。
  3. **現状維持＋既知の残件として記録** — 横展開スペックへ送る。
- **Selected Approach**: **案 2**。`useDocumentThemeSync(activeTheme)` を新設し、`useThemeCSS(activeTheme)` の直後（`DesktopLayout` / `MobileLayout`）で呼ぶ。実体は `applyCriticalTheme(getEffectKey(activeTheme) ?? null)` を `activeTheme` の変化時に実行するだけ。
- **Rationale**:
  - `applyCriticalTheme` が**冪等**（適用前に critical 変数と background-color を必ずクリア）なので、起動時の同期適用と衝突しない。FOUC ゼロ設計は無改変。
  - シェルルート div が既に文脈テーマで塗られている以上、`<html>` を同じ解決結果に合わせるのは**方針変更ではなく不整合の解消**。
  - 案 1 は `.theme-root` が `activeTheme` 非 null 時にしか付かないため常に body フォールバックが必要で、かつ祖先の `overflow` に位置決めが影響される新リスクを持ち込む。さらに浮遊面が Layer③ の到達範囲に入り、Req5.1（浮遊面は Layer①）と矛盾する。
  - 案 3 は「相乗り基盤」を名乗る本スペックの Req7.2 を空手形にする。
- **Trade-offs**: 文脈テーマが有効な状態で床を切り替えると、`setShellTheme` → `applyCriticalTheme(床)` の直後に effect が `applyCriticalTheme(文脈)` で上書きするため、`<html>` 背景が最大 1 フレームちらつく。実害は視認困難だが design.md の Risks に記録する。
- **Follow-up**: `useDocumentThemeSync` のユニットテストで「文脈テーマ優先」「null で属性除去」「同一 slug 再適用の冪等性」を固定する。

### Decision 2: 押下状態は「地・文字・境界・字幅・属性」の 5 点セットで表現する

- **Context**: Req2.5 は「ホバーと押下が同一の見た目にならない」、Req6.4 は「色のみで伝達しない」を要求する。
- **Findings**: mori の `--state-hover: rgba(134,239,172,0.10)` と `--state-selected: rgba(134,239,172,0.18)` を `--surface` 上に合成した実測コントラストは **1.281 vs 1.605**、両者の相互比は **1.253**。地の差だけでは識別不能に近い。
- **Selected Approach**: `.shell-button[aria-pressed='true']` に以下を同時付与する。
  | 軸 | OFF | ON |
  | --- | --- | --- |
  | 地 | `--surface-variant` | `--state-selected` |
  | 文字 | `--on-surface` | `--on-state-selected` |
  | 境界 | `--outline` | `--accent` |
  | 字幅 | 既定 | `600`（形状の手がかり） |
  | 属性 | `aria-pressed="false"` | `aria-pressed="true"` |
- **Rationale**: 色以外の手がかりを 2 系統（font-weight ＝ 形状、`aria-pressed` ＝ 属性）持たせることで、Req6.4 を色差の大小に依存せず満たす。`--on-state-selected`（#f0fdf4）の押下面上コントラストは白床 worst-case で **4.72:1** ＝ AA 成立。
- **Trade-offs**: `font-weight` の変化は幅を変えうるため、ボタンにレイアウトシフトが出る可能性がある。対策として押下対象のボタンは固定幅を持たない小型トグルに限定されている（ツールバー 8 個・コールアウト種別 3 個）ことを確認済み。実装時にシフトが目立つ場合は `font-weight` を `letter-spacing` 据え置きで適用する。
- **Follow-up**: ホバーは「押下していないときだけ」効かせる（`.shell-button:not([aria-pressed='true']):hover`）。押下中のホバーで ON 表現が壊れないようにする。

### Decision 3: `disabled` は opacity をやめ、前景色の切替で表現する

- **Context**: Req2.6。R-5 の実測で `opacity-50` が白床 worst-case 2.86:1、opacity 0.7 でも 4.02:1 と AA 未達。
- **Selected Approach**: `.shell-button:disabled` / `.shell-button-primary:disabled` を `color: var(--on-surface-variant)` / `background-color: var(--surface-variant)` / `border-color: var(--outline)` / `box-shadow: none` / `cursor: not-allowed` とし、**`opacity` を一切使わない**。
- **Rationale**: 半透明 surface（mori の alpha 0.74）に opacity を重ねると、生きた背景の最明値が二重に透けて実効コントラストが崩壊する。前景色の切替は合成が 1 段で済み、`--on-surface-variant` は既に「低強調でも AA」を満たす値として検証済み（5.19:1）。
- **Trade-offs**: 中立時の見た目が現行（gray の 50% 減衰）から「gray-500 文字 ＋ gray-50 地」へ変わる。可読性は向上方向で Req8.1「後退させない」に反しない。
- **Follow-up**: `tokens.contrast.test.ts` に「`--on-surface-variant` / `--surface-variant` が両床で AA」を既存アサーションとして持っているため、追加検証は不要。

### Decision 4: 破壊（danger）／成功（success）を 2 段（solid ＋ container）で定義する

- **Context**: 二次対象は赤（破壊）・緑（成功/共有中）を持ち、`--accent` へ潰すと「保存」と「削除」が同色になり意味を失う（gap-analysis G-2）。
- **Alternatives Considered**:
  1. **solid 1 段のみ**（`--danger` / `--on-danger`、`--success` / `--on-success`）— 4 トークン。ステータスピル・トーストが淡色から濃色ソリッドへ変わり、中立時の見た目が現行から離れる。
  2. **solid ＋ container の 2 段** — 8 トークン。現行の淡色コンテナ（`bg-green-100 text-green-800` / `bg-red-50 text-red-800`）を素直に受け止められる。
  3. **二次対象を落とす** — requirements Req1.2 の改訂が必要。
- **Selected Approach**: **案 2**。`--danger` / `--on-danger` / `--danger-container` / `--on-danger-container` と、`--success` 系の同型 4 本、計 8 役割。加えてモーダル暗幕用に `--scrim` を 1 本（前景を持たない非テキスト面のため対を作らない）。
- **Rationale**: Req8.1 が「実装前と同等の中立配色」を要求するため、淡色コンテナを濃色ソリッドに潰すのは望ましくない。Req7.6（面と前景の可読ペア）を満たす形は container 側にも必要。
- **Trade-offs**: 新役割 9 本 × 2 テーマ ＝ 18 値のコントラスト検証が増える。ただし `contrast.ts` の既存ユーティリティで機械化でき、追加コストは検証テーブル 1 枚ぶん。
- **重要な前提条件（契約に明記する）**: `--danger` / `--success` を**テキスト色として使えるのは `--surface` 系の面の上だけ**。アプリ床の直上に置くと mori の白床 worst-case で **1.45 / 1.28** まで落ちる。design.md の「トークン適用条件」に明文化する。

#### 決定値と実測コントラスト

| 役割                                             | `:root`（中立）       | 中立の比 | `[data-theme='mori']`                |                                         mori worst-case 比 |
| ------------------------------------------------ | --------------------- | -------: | ------------------------------------ | ---------------------------------------------------------: |
| `--danger` / `--on-danger`                       | `#dc2626` / `#ffffff` |     4.83 | `#fecaca` / `#2b0a0a`                |                12.62（solid）／ 4.83（surface 上テキスト） |
| `--danger-container` / `--on-danger-container`   | `#fef2f2` / `#991b1b` |     7.60 | `rgba(69, 10, 10, 0.88)` / `#fecaca` |                                       8.18（4 経路の最小） |
| `--success` / `--on-success`                     | `#15803d` / `#ffffff` |     5.02 | `#a7f3d0` / `#04230f`                |                13.07（solid）／ 5.45（surface 上テキスト） |
| `--success-container` / `--on-success-container` | `#dcfce7` / `#166534` |     6.49 | `rgba(6, 78, 59, 0.88)` / `#a7f3d0`  |                                       5.47（4 経路の最小） |
| `--scrim`                                        | `rgba(0, 0, 0, 0.5)`  |        — | `rgba(3, 18, 10, 0.62)`              | 非テキスト（暗幕上の `.shell-popover` は白床合成で 11.35） |

container の「4 経路」＝ {アプリ床の直上 / `--surface` の上} × {通常床 `#062616` / worst-case 白床 `#ffffff`}。alpha 0.62 では床直上・白床で 3.42（danger）／2.75（success）と AA を割るため **0.88** を採用した。

中立値は現行 Tailwind との差分を最小化しつつ AA を満たす階調を選んだ（`bg-red-500` 3.76 → `--danger` 4.83、`bg-green-500` 2.28 → `--success` 5.02）。いずれも**可読性は改善方向**であり Req8.1「後退させない」に適合する。

### Decision 5: 本文編集面は Layer③ の所有のまま、Layer① は「prose の脱色」だけを担う

- **Context**: Req4（prose 上書きの解消）と Req1.5 / 5.2 / 5.3（本文面は Layer③ 所有）の両立。
- **Selected Approach**: `.memo-content` を持つラッパー div に `.shell-prose-host` を併記し、
  - `.shell-prose-host { color: var(--on-surface) }` — 詳細度 (0,1,0)。**中立時の着地先を `#111827` に固定するためだけ**の宣言。テーマ時は Layer③ の (0,2,0) が勝つ。
  - `.shell-prose-host .ProseMirror { color: inherit; --tw-prose-*: currentColor }` — `.prose`（0,1,0）の `color: var(--tw-prose-body)` を (0,2,0) で打ち消し、親から継承させる。`--tw-prose-*` は prose のハードコード色を脱色するだけで色を決めない（R-3）。
  - `RichTextEditor.tsx:71` の `editorProps.attributes.class` から **`text-gray-900` のみ**を除去し、`prose` 系クラス文字列は温存する（既存ユニットテストが依存）。
- **Rationale**: `.ProseMirror` に `color: var(--on-surface)` を直接書く案は、子への直接指定がテーマ時も Layer① に本文色を握らせ、Layer③ の `--theme-text-color` を永久に無効化する。mori では `--on-surface: #e8f6ee` と `--theme-text-color: #e7f5ec` がほぼ同値のため**症状が出ず気づけない**。構造的に避ける。
- **Trade-offs**: ラッパー div に className を 1 つ足すため、`MemoEditor.tsx` / `NotebookEditor.tsx` の 2 箇所を触る。レイアウト・DOM 構造は不変（Req1.6 に適合）。
- **Follow-up**: `.shell-prose-host` は `primitives.css` に置く。`primitives.css.test.ts` のトップレベルセレクタ検査は「`.shell-` で始まる」を要求するだけなので、`.shell-prose-host .ProseMirror` も通過する。

### Decision 6: `codeHighlight.css` は本スペックのスコープ外とし、既知の残件として送る

- **Context**: `editor/codeHighlight.css` は生カラーリテラル 13 個・`var()` 0 個を持ち、森テーマでコードブロックだけ配色が浮く（gap-analysis 1.6 の見落とし候補）。
- **Selected Approach**: 本スペックのスコープに**含めない**。design.md の Open Questions に「既知の残件」として明記し、後続スペックへ送る。
- **Rationale**:
  1. requirements Req1.1 / 1.2 はコンポーネントを名指しで列挙しており、`codeHighlight.css` は含まれない。
  2. コードブロックは `.memo-content` 配下の本文面であり、Req1.5 が本文面の配色を Layer③ の担当としている。
  3. シンタックスハイライトは hljs のトークン種別（comment / keyword / string / number / title / attr / built_in / addition / deletion …）ごとに 10 色超の独立したパレットを要求する。これは shell トークン語彙とは別次元の語彙であり、Decision 4 の 9 役割にさらに 10 役割超を積むことになる。
- **Trade-offs**: 森テーマでコードブロックを含むメモを開くと、その部分だけ従来配色のまま残る。ユーザー影響は「コードブロックを使うメモに限定」。
- **Follow-up**: 後続スペック候補として記録。`callout.css`（`var()` 4 / 生 0）と `table.css`（両方 0）は健全なため対象外。

---

## Risks & Mitigations

| #   | Risk                                                                                                | Mitigation                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `useDocumentThemeSync` 追加で `<html>` 背景が文脈テーマへ追随し、床切替時に 1 フレームちらつく      | `applyCriticalTheme` の冪等性で状態は必ず収束する。ユニットテストで「文脈優先」「null で属性除去」を固定。視認性はスクリーンショット E2E で確認              |
| 2   | `MemoPalette` / `MemoSearch` / `TrashView` に既存ユニットテストが無く、安全網なしの改修になる       | 3 ファイルぶんの回帰ガードテストを**新規作成**する（`Header.test.tsx` パターン）。トークン化と同一タスク内で書く                                             |
| 3   | `RichTextEditor.test.tsx` が `prose` 系クラス文字列の存在をアサートしており、className 書換で落ちる | `text-gray-900` のみを除去し `prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-full p-4` は温存する契約を design に明記 |
| 4   | `--danger` / `--success` をアプリ床の直上のテキストに使うと mori 白床で AA を割る（1.45 / 1.28）    | トークン契約に「`--surface` 系の面の上でのみ有効」を明記。対象ファイルのルート面を `.shell-surface` 系でトークン化することを実装条件に含める                 |
| 5   | `font-weight: 600` の押下表現でツールバーにレイアウトシフトが出る                                   | 対象は固定幅を持たない小型トグル（ツールバー 8・コールアウト 3）に限定済み。目立つ場合は実装時に `letter-spacing` 据え置きで調整                             |
| 6   | 新プリミティブを reduced-motion ブロックへ追記し忘れる（Req6.5）                                    | `primitives.css.test.ts` に「新クラスが reduced-motion ブロックに列挙されている」検査を追加する                                                              |
| 7   | Layer③（`mori.css`）側に後から `.shell-*` の色定義が足され Req5.3 が破られる                        | `mori.css` を対象に「`.shell-` で始まるセレクタを持たない」検査を追加する                                                                                    |

---

## References

- [WCAG 2.1 SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) — 本文 4.5:1 / 大きな文字 3:1 の根拠
- [WCAG 2.1 SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html) — フォーカスリング・境界の 3:1 の根拠
- [CSS Color Module Level 3 — currentColor](https://www.w3.org/TR/css-color-3/#currentcolor) — 「`color` プロパティ自身に `currentColor` を設定した場合は `inherit` として扱う」＝ `--tw-prose-body: currentColor` が継承を復活させる根拠
- [ARIA `aria-pressed`](https://www.w3.org/TR/wai-aria-1.2/#aria-pressed) — トグルボタンの状態伝達
- 社内: `.kiro/steering/20260625-theme-immersive-world/brainstorm.md` — Layer①/②/③ 3 層分割の由来
- 社内: `frontend/src/themes/shell/tokens.css:1-28` / `primitives.css:1-25` — 層所有と不変則の一次資料
- 社内: `.kiro/specs/editor-surface-tokenization/gap-analysis.md` — 本 research の出発点
