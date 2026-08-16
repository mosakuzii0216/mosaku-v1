# 実装ギャップ分析 — editor-surface-tokenization

**対象**: `.kiro/specs/editor-surface-tokenization/requirements.md`（Requirement 1〜8 / requirements-generated・未承認）
**分析日**: 2026-08-10
**方針**: 情報提供に徹する。決定は design フェーズへ委ねる。

---

## 分析サマリー

- **前提基盤はほぼ揃っている**。theme-immersive-world が Layer①（`tokens.css` 30+ ロール ＋ `primitives.css` 13 クラス）・contrast 検証ユーティリティ・「生 Tailwind 残存 0」ユニットガード・バックエンド非依存 E2E（`display-mode-theme.spec.ts`）を全部残した。**新規トークン役割は「ほぼ不要」で足りる可能性が高い**（Req2 の押下状態は既存 `--state-selected` / `--on-state-selected` の再利用で成立し、Req3 の浮遊面は既存 `--surface` / `--outline` / `--elevation-3` を読む**新プリミティブ 1 枚**で成立する）。
- **最大の構造ギャップは「ポータル」**。スラッシュコマンド候補は tippy が `appendTo: () => document.body`（`suggestion.ts:122`）で **`.theme-root` の外**へ出す。Layer③（`.theme-root` → `[data-theme-id]` スコープ）は**構造的に到達不能**で、Layer①（`<html data-theme>` から継承）でしか塗れない。Req5.1 の責務分離はここで機械的に強制される（＝設計判断ではなく物理制約）。
- **同時に、ポータルには「テーマ源泉の二重化」バグ疑いがある**。in-tree 要素はシェルルート div の `data-theme={getEffectKey(activeTheme)}`（メモ→ノートブック解決）を、body ポータルは `<html data-theme>`（localStorage シェル床）を見る。**両者が食い違うとポップオーバーだけ別テーマ/中立で描画される**。Req3.1 / 7.2 に直撃する要調査項目（G-1）。
- **二次対象（Req1.2）にトークン語彙が足りない**。TrashView は赤（破壊）・ShareMemoControl は緑（成功/共有中）・MemoEditor は青と赤を使うが、tokens.css に **danger / success の役割が無い**。Req5.4 は「語彙へ役割として追加」を許すが、Req7.3（値は mori と `:root` のみ）・Req7.6（面と前景のペア）を伴い、コントラスト検証も増える。**スコープ確定（Req1.5）＝この語彙拡張を飲むか否か**が実質的な分岐点。
- **実測インベントリは requirements の記載より多い**（生 Tailwind 配色ユーティリティの出現数）。RichTextEditor 58 / MemoPalette 29 / ShareMemoControl 22 / TrashView 18 / MemoSearch 11 / MemoEditor 10 / SlashCommandList 9 / EditorBubbleMenu 7 ＝ **計 164 箇所**。タスク見積もりはこの実数で行うのが安全。

---

## 1. 現状調査（Current State）

### 1.1 テーマの三層構造と「どこまで届くか」

| 層         | 実体                                                                                                                                      | 適用点                                                               | 配信                                                        | エディタ面への到達                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| **Layer①** | `src/themes/shell/tokens.css`（`:root` 中立 ＋ `[data-theme='mori']` 35 値）<br>`src/themes/shell/primitives.css`（`.shell-*` 13 クラス） | `<html data-theme="mori">` ＋ シェルルート div                       | `index.css` から `@import`（バンドル同梱・render-blocking） | **文書全体（ポータル含む）** ✅       |
| **Layer②** | `shellThemeCritical.ts` → `applyCriticalTheme(slug)`                                                                                      | `<html>` へ `data-theme` ＋ core 変数をインライン                    | 起動時同期（FOUC ゼロ）                                     | 同上                                  |
| **Layer③** | `public/themes/{name}/{name}.css`                                                                                                         | `useThemeCSS` が `.theme-root` → `[data-theme-id="<id>"]` へ書換注入 | 当該テーマ有効時のみ fetch                                  | **`.theme-root` サブツリー内のみ** ⚠️ |

### 1.2 対象 3 面の DOM 位置（Req5 の責務分離を左右する決定的事実）

| 面                                         | マウント位置                                                                                                            | Layer① | Layer③                                                      | 含意                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- | ---------------------------------------------- |
| ツールバー（`RichTextEditor.tsx:115-201`） | `.rich-text-editor` 内 ＝ `.memo-content` 内 ＝ `.theme-root` 内                                                        | ✅     | ✅（`.theme-root .memo-content` の `color` を継承）         | **両層が届く＝二重管理リスクの本丸**（Req5.3） |
| バブルメニュー（`EditorBubbleMenu.tsx`）   | `RichTextEditor.tsx:204` で `.rich-text-editor` 内にレンダー。tiptap v3 `BubbleMenu` の最終 DOM 位置は**未確認**（R-1） | ✅     | in-tree なら ✅ / ポータルなら ❌                           | R-1 の結論次第で責務分離の書き方が変わる       |
| スラッシュ候補（`SlashCommandList.tsx`）   | `suggestion.ts:120-122` の tippy `appendTo: () => document.body` ＝ **`.theme-root` の外**                              | ✅     | **❌ 到達不能**                                             | **Layer① 一択が物理的に確定**（Req5.1 を追認） |
| MemoPalette（`MemoPalette.tsx`）           | `DesktopLayout.tsx:149` ＝ `.app-shell .theme-root` 内・`.memo-content` 外                                              | ✅     | `.theme-root` 直下だが `.memo-content` セレクタは当たらない | Layer① のみで完結・最もクリーン                |

### 1.3 既存トークン語彙（`tokens.css`）

```
面     : --surface / --on-surface / --surface-variant / --on-surface-variant
境界   : --outline
強調   : --accent / --on-accent
状態   : --state-hover / --state-selected / --on-state-selected / --focus-ring
床     : --shell-base-bg / --app-shell-bg
奥行   : --elevation-1 / --elevation-2 / --elevation-3
質感   : --surface-texture / --surface-backdrop
余白   : --shell-space-1..6
タイポ : --shell-font / --shell-text-sm|base|lg|xl / --shell-line-height / --shell-letter-spacing
編集色 : --editor-text-{wakaba,sora,kohaku,sumire} / --editor-marker-{kiiro,midori,momo,mizu}(+on-)
         --editor-callout-{point,warning}-{bg,on}
```

**mori のみ 35 値実装済み。umi / yoru / asa は `tokens.css:179-181` でコメント placeholder のまま**（Req7.3 の前提と一致）。

### 1.4 既存プリミティブ（`primitives.css`）と「あと一歩」

- `.app-shell` / `.shell-surface` / `.shell-panel` / `.shell-card`(+`:hover`) / `.shell-nav-item`(+`:hover` / `:focus-visible` / `[aria-current='page']` / `.is-active`) / `.shell-field`(+`::placeholder` / `:focus-visible`) / `.shell-button` / `.shell-button-primary`(+`:hover` / `:active` / `:focus-visible`) / `.shell-title` / `.shell-subtitle` / `.shell-text-muted` / reduced-motion ブロック。
- **朗報 1**: `.shell-nav-item[aria-current='page'], .is-active` が **「選択層の地 ＋ その上で読める文字」の完成形パターン**（`primitives.css:110-114`）。Req2 の押下状態はこの写しで足りる。
- **朗報 2**: `.shell-panel` が `--elevation-2` ＋ `--outline` ＋ `--surface-backdrop` を既に持つ。Req3 の浮遊面はここに `--elevation-3` と `overflow` / `z-index` を足した派生で足りる。
- **不足 1**: `.shell-button` に **`:disabled` ルールが一切無い**（Req2.6 の「判読可能な最小コントラストを下回らない」が未定義）。
- **不足 2**: `[aria-pressed='true']` セレクタが存在しない（Req2.1〜2.5）。
- **不足 3**: スクリム（`MemoPalette.tsx:188` の `bg-black bg-opacity-50`）に対応するトークン／クラスが無い。

### 1.5 生 Tailwind 配色の実測インベントリ

配色ユーティリティ（`bg-|text-|border-|ring-|placeholder-|divide-` × 色名）の**出現数**：

| ファイル                      |    実測 | requirements の記載 | 差分の理由                                  |
| ----------------------------- | ------: | ------------------: | ------------------------------------------- |
| `editor/RichTextEditor.tsx`   |  **58** |  （中核として言及） | 8 ボタン × 同一パターンの反復               |
| `memo/MemoPalette.tsx`        |  **29** |                  18 | `hover:` 変種・`placeholder-` を計上        |
| `memo/ShareMemoControl.tsx`   |  **22** |                   3 | 緑/赤の状態表現が多い                       |
| `memo/TrashView.tsx`          |  **18** |                   9 | 同上                                        |
| `memo/MemoSearch.tsx`         |  **11** |                   4 | `ring-` / `placeholder-` を計上             |
| `memo/MemoEditor.tsx`         |  **10** |  （残存として言及） | 保存 `bg-blue-500` / 削除 `bg-red-500` ほか |
| `editor/SlashCommandList.tsx` |   **9** |  （中核として言及） | —                                           |
| `editor/EditorBubbleMenu.tsx` |   **7** |  （中核として言及） | `SWATCH_BUTTON_CLASS` 定数 1 本に集約済み   |
| **計**                        | **164** |                   — | —                                           |

**構造的な救い**: `EditorBubbleMenu` は 27 個のボタンが `SWATCH_BUTTON_CLASS`（`EditorBubbleMenu.tsx:12-13`）1 定数を共有する。RichTextEditor の 8 ボタンも完全同型。**置換は「定数 1〜2 本の書換」で 65 箇所が片付く**。

### 1.6 prose 問題（Req4）の実態

- 原因: `RichTextEditor.tsx:71` が ProseMirror 要素へ `... p-4 text-gray-900` を直付け。Layer③ の `.theme-root .memo-content { color: var(--theme-text-color) }`（`mori.css:61-67`）を子側で潰している。
- **解法は実証済み**: `index.css:129-148` の `.display-mode-content .ProseMirror { color: inherit; --tw-prose-*: currentColor; ... }`。同じ形を `.rich-text-editor .ProseMirror` へ写すだけ。
- **Layer③ との重複懸念**: mori.css は `.theme-root .memo-content` 配下の `h1..h6 / p / strong / em / s / ul / ol / li / blockquote / pre / code / hr / a` に色とマージンを持つ（`mori.css:69-160`）。Req1.5 でタイポは Layer③ 残置と決まっているが、**`--tw-prose-headings: currentColor` を Layer① で敷くと「見出し色」が二重定義になる**（詳細度は Layer③ が勝つ見込みだが要検証・R-3）。
- **中立フォールバックの落とし穴**: `text-gray-900` を外して `color: inherit` にすると、テーマ未適用時は `.memo-content` に色指定が無いため body 継承 ＝ ブラウザ既定 `#000` に落ちる。**現状の `#111827`（gray-900）とは別値**で、Req4.4「実装前と同等」を厳密には満たさない（R-4）。
- **見落とし候補**: `editor/codeHighlight.css` は **生カラーリテラル 13 個 / `var()` 0 個**（`createEditorExtensions.ts:15` でバンドル同梱）。requirements はコンポーネント 3 ファイルを名指しするため文面上はスコープ外だが、**森テーマでコードブロックだけ配色が浮く**同じ病。`callout.css`（`var()` 4 / 生 0）・`table.css`（両方 0）は健全。

### 1.7 検証資産（そのまま再利用できる）

| 資産                                   | 内容                                                                                                            | 本 spec での用途                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `themes/contrast.ts`                   | `parseColor` / `compositeOver` / `relativeLuminance` / `contrastRatio` / `findBlock` / `extractVar`             | **Req6.2 の半透明 worst-case 白床合成**をそのまま実装可能                                                                                                 |
| `themes/shell/tokens.contrast.test.ts` | mori の surface×on-surface を通常床/白床の両方で AA 検証                                                        | 新役割を足すなら同ファイルに追記                                                                                                                          |
| `themes/shell/primitives.css.test.ts`  | 「hex/rgb リテラル直書き禁止」「トップレベルセレクタは `.shell-*` / `.app-shell` のみ」                         | **新プリミティブは追加した瞬間に自動でこのガード下に入る**（Req5.5 / 5.6）                                                                                |
| `ui/Header.test.tsx:63-99`             | 「`.shell-*` を持つ **かつ** `className` が `/bg-white\|text-gray-600/` に一致しない」                          | **Req1.4 / 8.5 の回帰ガードの完成テンプレ**                                                                                                               |
| `e2e/display-mode-theme.spec.ts`       | `page.route` 全面モック ＋ `getComputedStyle` ＋ 「Tailwind 値に戻ったら落ちる」 `not.toBe('rgb(243,244,246)')` | **Req8.4 のテンプレ**（backend 不要）                                                                                                                     |
| `e2e/slash-command.spec.ts`            | `.slash-command-list` をキーボード操作で開閉・遷移まで駆動                                                      | **操作手順のテンプレ**。ただし**実バックエンド依存**（`BackendApi` ＋ 実ログイン）なので、Req8.4 を満たすには display-mode-theme のモックと**合成**が必要 |

### 1.8 既存テストの当たり方（壊れる／守られる）

| 対象                                     | 既存ユニットテスト                                  | 注意点                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RichTextEditor                           | `RichTextEditor.test.tsx`                           | **`prose` / `prose-sm` / `sm:prose-base` / `lg:prose-lg` / `xl:prose-xl` の存在を assert**（:89, :99-103）。`text-gray-900` だけを外し、prose 系文字列は温存すること |
| EditorBubbleMenu                         | `EditorBubbleMenu.test.tsx`                         | className の色 assert は無し。安全                                                                                                                                   |
| SlashCommandList                         | `SlashCommandList.test.tsx`                         | 同上                                                                                                                                                                 |
| MemoEditor / ShareMemoControl            | `MemoEditor.test.tsx` / `ShareMemoControl.test.tsx` | 既存あり                                                                                                                                                             |
| **MemoPalette / MemoSearch / TrashView** | **無し**                                            | トークン化が**完全に無防備**。新規ユニット（Header パターン）を書くか、E2E のみで許容するかの判断が要る                                                              |

---

## 2. Requirement → 資産マップ

ギャップ種別: 🔴 Missing（無い／作る） / 🟡 Unknown（要調査） / 🟢 Constraint（既存制約に従う）

| Req                                              | 必要なもの                                                                                                                     | 既存資産 | ギャップ                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| **1.1** 一次対象 3 面の定義                      | `RichTextEditor` / `EditorBubbleMenu` / `SlashCommandList` は特定済み                                                          | —        | 🟢                                                                                                                |
| **1.2** 二次対象の定義                           | MemoPalette / ShareMemoControl / TrashView / MemoSearch / MemoEditor 残存                                                      | —        | 🔴 **danger / success 役割が語彙に無い**（G-2）                                                                   |
| **1.3** 面ごとの専用クラス新設禁止               | `.shell-*` の共通語彙                                                                                                          | —        | 🟢（Option B を実質的に禁止する条項）                                                                             |
| **1.4** 生 Tailwind 残存でテスト失敗             | `Header.test.tsx` パターン                                                                                                     | —        | 🔴 対象 8 ファイル分のガードを新規作成                                                                            |
| **1.5** 本文タイポは Layer③ 残置                 | `mori.css:47-160` に既存                                                                                                       | —        | 🟢                                                                                                                |
| **1.6** 機能追加・レイアウト変更を含まない       | —                                                                                                                              | —        | 🟢                                                                                                                |
| **2.1-2.5** 押下（トグル）状態プリミティブ       | `.shell-nav-item[aria-current='page']` が完成形パターン<br>`--state-selected` / `--on-state-selected` / `--state-hover` は既存 | —        | 🔴 `.shell-button[aria-pressed='true']` セレクタが無い<br>🟡 hover と pressed の視覚差の作り分け（Req2.5）        |
| **2.3** `aria-pressed` の付与                    | `EditorBubbleMenu.tsx:156` が**コールアウト種別で既に使用**（先例あり）                                                        | —        | 🔴 ツールバー 8 ボタン ＋ スラッシュ選択に未付与                                                                  |
| **2.6** disabled の可読性                        | 現状 `disabled:opacity-50` を直書き                                                                                            | —        | 🔴 `.shell-button:disabled` が未定義。opacity 由来の実効コントラストは AA を割る可能性                            |
| **3.1-3.2** 浮遊面プリミティブ                   | `.shell-panel`（`--surface` / `--outline` / `--elevation-2` / `--surface-backdrop`）                                           | —        | 🔴 `.shell-popover` 相当（`--elevation-3` ＋ `overflow` ＋ `max-height` ＋ スクリム）が無い                       |
| **3.3** 候補の選択状態                           | `--state-selected` / `--on-state-selected`                                                                                     | —        | 🔴 リスト項目用プリミティブ（`[aria-selected]` or `.is-active`）が無い                                            |
| **3.4** 補助テキストの低強調                     | `.shell-text-muted`（`--on-surface-variant`）                                                                                  | —        | 🟢 そのまま流用可                                                                                                 |
| **3.5** 既存の表示条件・キーボード挙動を変えない | `shouldShow`（`EditorBubbleMenu.tsx:15-23`）／`useImperativeHandle(onKeyDown)`（`SlashCommandList.tsx:45-69`）                 | —        | 🟢（className 置換のみに留める）                                                                                  |
| **3.6** スウォッチ値はテーマ非依存維持           | `slashCommandItems.ts:288` の `swatchColorVar` ＋ `tokens.css:92-109`                                                          | —        | 🟢 **ただし `SlashCommandList.tsx:95` の `border-gray-300`（スウォッチ枠）は面側＝トークン化対象**                |
| **4.1-4.3** prose 上書きの解消                   | `index.css:129-148` に実証済みの解法                                                                                           | —        | 🔴 `.rich-text-editor .ProseMirror` 版が無い<br>🟡 Layer③ 見出し色との重複（R-3）                                 |
| **4.4** 中立フォールバック                       | —                                                                                                                              | —        | 🟡 `color: inherit` の着地先が `#000` になる懸念（R-4）                                                           |
| **4.5** 本文の字階層は Layer③ 準拠               | `mori.css:61-160`                                                                                                              | —        | 🟢                                                                                                                |
| **4.6** 編集⇄表示モードの配色一致                | `.display-mode-content .ProseMirror` と対称化                                                                                  | —        | 🟢 同一手法を使えば自動的に成立                                                                                   |
| **5.1-5.6** 層の責務分離                         | tokens.css / primitives.css の冒頭コメントに契約が明文化済み                                                                   | —        | 🟢 **スラッシュ候補はポータルで物理的に Layer① 一択**（追認）<br>🟡 ツールバーは両層が届くため境界の明記が要る    |
| **6.1-6.2** AA・半透明 worst-case                | `contrast.ts` ＋ `tokens.contrast.test.ts`                                                                                     | —        | 🟢 新役割を足す場合のみテスト追記                                                                                 |
| **6.3** フォーカスリング                         | `.shell-button:focus-visible` / `.shell-nav-item:focus-visible`                                                                | —        | 🟢                                                                                                                |
| **6.4** 色以外の手がかり                         | `aria-pressed`（Req2.3）で担保                                                                                                 | —        | 🟢                                                                                                                |
| **6.5** reduced-motion                           | `primitives.css:212-220`                                                                                                       | —        | 🔴 新プリミティブを同ブロックへ追記する必要                                                                       |
| **6.6** アクセシブルネーム後退禁止               | `role="group"` / `aria-label`（`EditorBubbleMenu.tsx:59,90,150`）                                                              | —        | 🟢                                                                                                                |
| **7.1-7.6** 4 テーマへの自動波及                 | 役割名は 4 テーマ共通・値は mori のみ                                                                                          | —        | 🟡 **ポータルと in-tree のテーマ源泉が別**（G-1）<br>🟢 それ以外は既存契約で成立                                  |
| **8.1** 非テーマ時の中立描画                     | `:root` 既定値が現行 Tailwind と一致                                                                                           | —        | 🟡 prose の着地先（R-4）のみ要注意                                                                                |
| **8.2** 外部ライブラリ追加ゼロ・バンドル不増     | —                                                                                                                              | —        | 🟡 **Layer① は全員に配られる**。文字通りの「不増」は不可能。測定可能な定義と検証手段が未定（R-6・自動ガード無し） |
| **8.3** 既存挙動を変えない                       | 置換対象は className のみ                                                                                                      | —        | 🟢                                                                                                                |
| **8.4** backend 非依存 E2E                       | `display-mode-theme.spec.ts`（モック）＋ `slash-command.spec.ts`（操作）                                                       | —        | 🔴 **両者の合成**が要る（既存の slash E2E は実 backend 依存で流用不可）                                           |
| **8.5** 直書き回帰でテスト失敗                   | `Header.test.tsx` パターン                                                                                                     | —        | 🔴 新規作成（1.4 と同一物）                                                                                       |
| **8.6** 既存テスト全緑                           | 1151 テスト（theme-immersive-world 時点）                                                                                      | —        | 🟡 `RichTextEditor.test.tsx` の prose assert に抵触しない書換が必要                                               |
| **8.7** BE / DB 変更なし                         | —                                                                                                                              | —        | 🟢 フロント CSS のみ                                                                                              |

---

## 3. 主要ギャップの深掘り（design で決着させるべき論点）

### G-1. ポータルと in-tree で `data-theme` の源泉が違う【🟡 Unknown・最重要】

- **in-tree**（ツールバー・本文・おそらくバブルメニュー）が見るのは、シェルルート div の
  `data-theme={getEffectKey(activeTheme)}`（`DesktopLayout.tsx:133` / `MobileLayout.tsx:121`）。
  `activeTheme` は `useActiveTheme` ＝ **編集中メモ → 選択中ノートブック → null** の優先順。
- **body ポータル**（スラッシュ候補）が見るのは、`applyCriticalTheme` が `<html>` に置く
  `data-theme`（`shellThemeCritical.ts:124`）＝ **localStorage のシェル床**。
- ⇒ **床が mori・ノートブックが umi のとき、ポップオーバーだけ mori（または床未設定なら中立の白）で描画される。**
- Req3.1「浮遊面を…解決する」／Req7.2「値供給だけで波及」に直撃する。**design で「テーマ源泉を一本化するか、ポータル側にも解決済みテーマを伝播させるか」を決める必要がある。**
- なお **umi / yoru / asa は tokens.css に値が無い**ため、現状は「どちらを見ても中立にフォールバック」で症状が顕在化しない。**横展開 spec が値を入れた瞬間に露見する時限式**であり、本 spec が「相乗り基盤」を名乗る以上ここで塞ぐのが筋。

### G-2. 二次対象が要求するのは「面の置換」ではなく「役割の新設」【🔴 Missing】

- TrashView: `text-red-500/600` / `bg-red-50` / `border-red-300`（破壊操作）、`text-blue-600` / `bg-blue-50`（情報・選択）
- ShareMemoControl: `bg-green-500/600` / `text-green-700/800` / `bg-green-50/100` / `border-green-300/500`（共有中＝成功状態）、赤系（停止＝破壊）
- MemoEditor: `bg-blue-500`（保存＝primary）、`bg-red-500`（削除＝破壊）
- **`--accent` / `--on-accent` に潰すと「保存」と「削除」が同色になり、Req6.4（色以外の手がかり併用）以前に意味を失う。**
- Req5.4 は役割追加を許可、Req7.6 は面と前景のペアを要求、Req7.3 は値を mori と `:root` に限定、Req6.1-6.2 はコントラスト機械検証を要求。
  ⇒ `--danger` / `--on-danger` / `--success` / `--on-success`（＋淡色面が要るなら `-container` 系）を足すなら、**tokens 2×2〜4×2 値 × 中立/mori ＋ contrast テスト**が付随する。
- **これが Req1.5「スコープ確定」の実質的な中身**。一次 3 面だけなら新役割ゼロで済む。

### G-3. ツールバーだけが両層に露出している【🟡 Unknown → 契約の明文化が必要】

- スラッシュ候補は Layer③ 到達不能（一択）、MemoPalette は `.memo-content` 外（Layer① のみ）。
  **ツールバーだけが `.theme-root .memo-content` の内側**にあり、Layer③ の `color` を継承する。
- 現状は `text-gray-700` が上書きして無効化しているが、**トークン化で `text-gray-700` を外した瞬間、ツールバーのボタン文字が Layer③ の `--theme-text-color` を継承し始める**。`.shell-button` が `color: var(--on-surface)` を明示すれば Layer① が勝つ（`.theme-root .memo-content` はボタンから見れば**継承元**にすぎず、子要素への直接指定が常に優先されるため。詳細度勝負にはならない）。**勝敗そのものは明確だが、design で「ツールバー・浮遊面は Layer① が色を持ち切る」と明文化しないと、Layer③ 側に後から色が足されて Req5.3（同一プロパティの二重定義）違反が忍び込む。**
- 派生論点: `.rich-text-editor` を `.memo-content` の外へ出す構造変更は **Req1.6（レイアウト変更禁止）に抵触**するため取れない。

### G-4. prose 中立フォールバックの微妙な劣化【🟡 Unknown】

- 前提の整理: `.memo-content`（ラッパー div）と `.ProseMirror`（その子孫）は**別要素**なので、両者は詳細度を争わない。**子に直接 `color` があれば、親からの継承には常に勝つ。**
  - 現状: `.theme-root .memo-content` が `--theme-text-color` を敷く → しかし `.ProseMirror` の `text-gray-900`（直接指定）が継承を握り潰す ＝ これが Req4 の病巣。
  - `text-gray-900` を外す → `.ProseMirror` は `.memo-content` から継承 → **テーマ時は Layer③ の色がそのまま通る**（Layer③ の本文面所有＝Req1.5 / 5.2 を維持）。
- **残る問題は非テーマ時**。`.memo-content` に色指定が無いため body 継承 ＝ ブラウザ既定 `#000` に落ちる。現状の `#111827`（gray-900）とは別値で、Req4.4「実装前と同等の中立配色」／Req8.1 を**厳密には満たさない**。
- 対策候補:
  - **(a) Layer① に素の `.memo-content { color: var(--on-surface) }` を置く【推奨】** — 同一要素上での詳細度勝負になり、テーマ時は `.theme-root .memo-content`(0,2,0) が `.memo-content`(0,1,0) に勝って Layer③ が本文色を所有し続ける。非テーマ時は `:root` の `--on-surface: #111827` が当たって現状と完全一致。**注入順に依存しない**のが利点。
  - (b) `.ProseMirror` に `color: inherit` だけ置き、`#000` への変化を許容して要件文を緩める。
  - (c) `.rich-text-editor .ProseMirror { color: var(--on-surface) }` — **非推奨**。子への直接指定なので**テーマ時も Layer① が本文色を所有してしまい**、Layer③ の `--theme-text-color` が永久に無効化される（Req1.5 / 5.2 / 5.3 に抵触）。mori では `--on-surface: #e8f6ee` と `--theme-text-color: #e7f5ec` がほぼ同値なので**症状が出ず気づけない**のが厄介。
- なお `--tw-prose-*: currentColor` の中和自体は `.rich-text-editor .ProseMirror` に置いて問題ない（`color` を直接指定するのではなく、prose が参照する変数を `currentColor` へ寄せるだけなので、継承してきた色をそのまま使う）。**「`color` は書かない、`--tw-prose-*` だけ書く」が Layer 責務を守る書き方。**

### G-5. Req8.2「バンドル不増」は文字通りには達成不能【🟡 Unknown】

- Layer①（tokens.css / primitives.css）は `index.css` 経由で**全ユーザーに配られる**。プリミティブを足せば CSS バイト数は必ず増える。
- theme-immersive-world での運用解釈は tokens.css の冒頭コメントにある通り **「重量物（テクスチャ画像・data-URI・テーマ固有装飾）を Layer① に置かない」＋「JS チャンクを増やさない」**。
- **リポジトリにバンドルサイズの自動ガードは存在しない**（`codeSplitVerification.test.ts` はエフェクトの動的 import 分割を検証するもので、サイズは見ていない）。
- ⇒ design で **測定可能な定義**（例:「新規 JS 依存ゼロ」「Layer① への追加は色・状態・構造の宣言のみ、data-URI / 画像ゼロ」「非森テーマで追加ネットワークリクエストゼロ」）と、**その検証手段**（既存 `primitives.css.test.ts` の禁止リテラル検査を拡張する等）を明記するのが安全。

---

## 4. 実装アプローチ（Option A / B / C）

### Option A — 既存プリミティブだけで押し切る（新トークン・新クラスを一切足さない）

対象コンポーネントに `.shell-button` / `.shell-panel` / `.shell-text-muted` を貼り、押下状態は `.shell-nav-item` の `.is-active` を流用する。

- ✅ 追加ゼロ。最速。Req8.2 の解釈論争が起きない。
- ❌ **Req2.1 が「押下状態を質感プリミティブとして質感層に備える」と明示的に要求**しており、流用では要件未充足。
- ❌ `.shell-button:disabled` が無いまま（Req2.6 未達）。浮遊面の elevation/スクリムも無い（Req3.2 未達）。
- ❌ 二次対象の danger / success を表現できない ⇒ Req1.2 を落とすしかない。
- **評価**: 要件充足度が足りない。一次対象のみに縮退しても Req2.6 / 3.2 が残る。

### Option B — エディタ専用の新レイヤーを作る（`editorSurface.css` ＋ `.editor-*` クラス）

- ✅ エディタ固有の要求を自由に表現でき、玄関の `.shell-*` を汚さない。
- ❌ **Req1.3「面ごとの専用クラスを新設しない」に正面から抵触。**
- ❌ `.shell-button` と `.editor-button` が同じ見た目を二重定義 ⇒ **Req5.3 違反**。
- ❌ 語彙が 2 系統になり、横展開 spec（Req7）が両方を面倒見る羽目になる。
- **評価**: 要件が明示的に禁じている。**採用不可**。

### Option C — Layer① の語彙を最小限拡張し、コンポーネントを in-place 置換（ハイブリッド・推奨候補）

1. **`primitives.css` に 3 つ足す**（新トークンは原則ゼロ・既存トークンを読むだけ）
   - `.shell-button[aria-pressed='true']` → `--state-selected` / `--on-state-selected`（`.shell-nav-item.is-active` の写し）
   - `.shell-button:disabled` → 可読下限を割らない減衰（opacity ではなく `--on-surface-variant` 系への切替が有力）
   - `.shell-popover`（＋ `.shell-popover-item[aria-selected='true']`、必要なら `.shell-scrim`）→ `--surface` / `--outline` / `--elevation-3` / `--surface-backdrop`
   - reduced-motion ブロック（`primitives.css:212-220`）へ新クラスを追記（Req6.5）
2. **`index.css` に prose 中和を 1 ブロック追加** — `.display-mode-content .ProseMirror` の対称形として `.rich-text-editor .ProseMirror`
3. **コンポーネント置換** — `RichTextEditor` の 8 ボタン（共通ヘルパへ抽出）／`EditorBubbleMenu` の `SWATCH_BUTTON_CLASS` 1 定数／`SlashCommandList` の 4 箇所
4. **テスト** — Header パターンのユニットガード ＋（新役割を足す場合のみ）contrast テスト ＋ `e2e/editor-surface-theme.spec.ts`（display-mode-theme のモック × slash-command の操作）

- ✅ 全 Requirement に素直に対応。新トークン役割は**一次対象なら 0〜1 個**で済む見込み。
- ✅ 新プリミティブは `primitives.css` に置いた瞬間に既存ガード（リテラル禁止・`.shell-*` 限定）が自動で効く。
- ✅ Req7 の「値供給だけで波及」を維持（テーマ名をコードに書かない）。
- ❌ G-1 / G-3 / G-4 の判断を design で明示的に下す必要がある（先送りすると横展開 spec に爆弾が残る）。
- ❌ 二次対象まで含めると danger / success の語彙拡張が付随（G-2）。

#### Option C のスコープ変種（Req1.5 の選択肢）

| 変種                     | 対象                                                 | 新トークン役割                                                         | Effort          | Risk           |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------- | --------------- | -------------- |
| **C1** 一次のみ          | RichTextEditor / EditorBubbleMenu / SlashCommandList | **0〜1**                                                               | **S**（1–3 日） | **Low**        |
| **C2** 一次 ＋ 浮遊面    | ＋ MemoPalette / MemoSearch / MemoEditor 残存        | **0〜2**（primary は `--accent` で足りる。削除ボタンで danger が要る） | **M**（3–5 日） | **Low–Medium** |
| **C3** requirements 全文 | ＋ TrashView / ShareMemoControl                      | **4–8**（danger / success ＋ container 系）                            | **M**（5–7 日） | **Medium**     |

**注**: requirements の Req1.2 は二次対象を明示列挙しているため、**現行文面のままなら C3 が正**。C1 / C2 を選ぶ場合は requirements の改訂が要る（gap 分析は requirements 改訂の入力にもなる、という `/kiro:validate-gap` の建て付けどおり）。

---

## 5. Effort & Risk

| 作業                                                  | Effort          | Risk            | 根拠                                                                                                                                           |
| ----------------------------------------------------- | --------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| プリミティブ 3 種追加（pressed / disabled / popover） | S               | Low             | `.shell-nav-item.is-active` / `.shell-panel` の写しで済む。既存ガードが自動適用                                                                |
| 一次 3 ファイルの置換                                 | S               | Low             | 共有定数 2 本の書換で 65 箇所が片付く構造                                                                                                      |
| prose 中和（Req4）                                    | S               | **Medium**      | Layer③ との詳細度・注入順・中立フォールバック（G-3 / G-4）が絡む                                                                               |
| ポータルのテーマ源泉統一（G-1）                       | S–M             | **Medium–High** | 原因特定は容易だが、修正が `useActiveTheme` / `useShellThemeStore` の責務に触れる可能性。触り方次第で theme-immersive-world の FOUC 設計に波及 |
| 二次 5 ファイル ＋ danger/success 語彙（G-2）         | M               | Medium          | 新役割 × 中立/mori 値 × contrast テスト。MemoPalette / MemoSearch / TrashView は**既存ユニットテスト無し**＝安全網なしの改修                   |
| E2E 新規（Req8.4 / 8.5）                              | S–M             | Low             | モック（display-mode-theme）と操作（slash-command）のテンプレが両方ある。合成するだけ                                                          |
| **合計（C1）**                                        | **S**           | **Low**         |                                                                                                                                                |
| **合計（C3・requirements 全文）**                     | **M**（5–7 日） | **Medium**      | G-1 を含めるなら上振れ                                                                                                                         |

---

## 6. design フェーズへの推奨

### 推奨アプローチ

**Option C（Layer① 語彙の最小拡張 ＋ in-place 置換）**。スコープは **C3（requirements 全文）を既定**とし、danger / success 役割の追加を design で正式に定義する。C1 / C2 へ縮退する場合は requirements の Req1.2 を先に改訂すること。

### design で確定すべき主要判断

1. **【最優先】G-1 ポータルのテーマ源泉**。`<html data-theme>`（シェル床）と シェルルート div の `data-theme`（`useActiveTheme`）を一本化するか、ポータル側へ解決済みテーマを伝播させるか。**横展開 spec が値を入れた瞬間に顕在化する時限バグ**であり、「相乗り基盤」を名乗る本 spec で塞ぐのが筋。
2. **G-2 新トークン役割の可否と粒度**。`--danger` / `--on-danger` / `--success` / `--on-success`（＋ `-container` 系）を足すか、二次対象を落とすか。Req7.3（値は mori と `:root` のみ）と Req7.6（可読ペア）を満たす形で定義する。
3. **G-3 ツールバーの層責務**。「ツールバー・浮遊面は Layer① が `color` を持ち切る／本文面 `.memo-content` 配下のタイポと配色のみ Layer③」を design に明文で書き、Req5.3 のチェック対象を機械化できる形（例: mori.css に `.shell-*` 系の色定義を足さない ＝ 既存 `mori.css.test.ts` を拡張）にする。
4. **G-4 中立フォールバック**。素の `.memo-content { color: var(--on-surface) }`（推奨・Layer③ の本文面所有を保つ）か、`inherit` ＋ 要件緩和か。**`.ProseMirror` に直接 `color` を書く案は Layer③ を殺すため避ける**ことを design に明記する。
5. **G-5 Req8.2 の測定可能な定義と検証手段**。
6. **`codeHighlight.css`（生リテラル 13 個）をスコープに含めるか**。含めないなら「森でコードブロックだけ配色が浮く」ことを既知の残件として design に明記し、後続 spec へ送る。
7. **押下（pressed）とホバーの視覚差の作り分け**（Req2.5）。mori の `--state-hover: rgba(134,239,172,0.10)` と `--state-selected: rgba(134,239,172,0.18)` は**同系色で差が 0.08 alpha しかない**。境界（`--outline` → `--accent`）や太字など、色以外の差分を併用する設計が要る。
8. **disabled の表現**（Req2.6）。現行の `opacity-50` は半透明面（mori の `--surface` は alpha 0.74）と重なると実効コントラストが読めなくなる。opacity ではなく前景色の切替（`--on-surface-variant`）を推奨。

### Research Needed（design で調査）

- **R-1**: tiptap v3 `@tiptap/react/menus` の `BubbleMenu` が DOM 上どこにマウントされるか（in-tree / ポータル）。`node_modules/@tiptap/react` の dist 配置を確認できなかったため未確定。**G-1 / G-3 の適用範囲が変わる。**
- **R-2**: G-1 の再現確認（シェル床 = mori・ノートブックテーマ = 別 の状態でスラッシュ候補のトークン解決値を実測）。
- **R-3**: Layer① で `--tw-prose-headings: currentColor` を敷いたときの `.theme-root .memo-content h1`（`mori.css:74`）との勝敗を実測。
- **R-4**: `text-gray-900` 除去後の非テーマ時 `color` 着地先の実測（`#000` になるか）。
- **R-5**: `.shell-button:disabled` を opacity 以外で表現した場合の AA 実測（半透明 surface × 白床 worst-case）。
- **R-6**: Req8.2 の検証手段の選定（既存 `primitives.css.test.ts` の拡張 / ビルド成果物サイズ比較 / 手動確認のいずれか）。
- **R-7**: 新 E2E で BubbleMenu を安定的に開けるか（テキスト選択の Playwright 操作）。スラッシュ候補は `slash-command.spec.ts` で駆動実績あり。

### 次のステップ

```
/kiro:spec-design editor-surface-tokenization
```

requirements が未承認（`spec.json.approvals.requirements.approved = false`）のため、design 実行時は `-y` で自動承認するか、先に requirements を承認すること。**なお本分析は Req1.2 のスコープ（二次対象を含めるか）と Req8.2 の文面に改訂余地を示しているため、design へ進む前に requirements を見直す選択肢もある。**
