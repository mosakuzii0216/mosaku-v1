# Research & Design Decisions — theme-immersive-world

---

**Purpose**: 承認済み requirements と既存コードベースの discovery 結果・設計判断の根拠を記録する。`design.md` に書ききれない比較・トレードオフの一次情報を保持する。

---

## Summary

- **Feature**: `theme-immersive-world`（第一スライス＝森 mori）
- **Discovery Scope**: Extension（既存テーマ機構の拡張。新規ライブラリ・DB 変更ゼロ）
- **Key Findings**:
  1. 森の「世界」（背景グラデ・霧・葉・粒子）は `MoriEffectLayer`（`position:fixed; inset:0; z-0`）で**既にアプリ全域へ描画済み**。本当の宿題は、その上に乗る玄関（Header / MemoList / MemoItem / HomeDashboard）の**生 Tailwind（`bg-white` / `text-gray-*`）という不透明なフタを外す**こと。
  2. 過去ロールバックの真因は **要素型セレクタ**（`.theme-root button` が `.theme-root` 置換後 `[data-theme-id] button` = 詳細度 0,1,1）が Tailwind `text-gray-600`（0,1,0）に勝ち、白背景ヘッダーで文字が明色化して消失したこと。`mori.css.test.ts` が**この禁止をテストで固定済み**＝設計はこの制約を継承し、面側（クラス）へトークン適用する。
  3. 最大構造ギャップは「アプリ単位の現在テーマの出どころが無い」こと。テーマ解決は `useActiveTheme.ts:22` で**ノートブック従属のみ**。User モデルにテーマ列なし・localStorage 永続なし → `activeTheme===null` で素の白シェルになる。Requirement 2.1 の受け皿を新設する必要がある。
  4. **2.3（FOUC ゼロ）と 7.5（非森ユーザーの初期バンドル不増）が正面衝突する。** 森トークン値を初期バンドルへ入れれば FOUC は消えるが 7.5 に反し、code-split すれば 7.5 は守れるが初回ペイントが白くなる。→ **3 層 CSS 分割**で両立させる（後述 Decision 3）。
  5. `mori.css.test.ts` が CSS 値をパース検証する先例 → Requirement 3.5（コントラスト AA 検証）はこのパターンを拡張し、translucent surface を base へ合成した solid 等価色で WCAG 比を機械計算できる。

---

## Research Log

### テーマ適用パイプラインの実体

- **Context**: 玄関へテーマを届けるには現行の適用経路と詳細度を正確に把握する必要がある。
- **Sources Consulted**: `hooks/useActiveTheme.ts` / `hooks/useThemeCSS.ts` / `utils/themeApplier.ts` / `utils/themeLoader.ts` / `components/layouts/DesktopLayout.tsx:133-137` / `MobileLayout.tsx:117-121`。
- **Findings**:
  - `useActiveTheme()` = `selectedNotebook?.theme || memo?.notebook?.theme || null`（ノートブック/メモ文脈のみ）。
  - `useThemeCSS()` は `useEffect` 内 async `fetch('/themes/<cssFilePath>')` → 文字列 `.theme-root` を `[data-theme-id="<id>"]` に置換 → `<style data-theme-loader>` を `document.head` に append。**初回ペイント後に適用＝構造的に FOUC が出る。**
  - 適用ローダーが 2 系統存在（`useThemeCSS` が能動経路、`utils/themeApplier.ts`/`themeLoader.ts` はオブジェクト型テーマ用の別系統）＝軽微な技術的負債。本スペックは**新規の静的バンドル層**を足すことでこの runtime ローダーを増やさない。
  - ルート div は `className="… bg-white ${activeTheme ? 'theme-root' : ''}"` ＋ `data-theme-id`。`bg-white` が常時同居し、テーマ背景にフタをしている。
- **Implications**: 玄関の彩色は「runtime 注入 CSS の詳細度勝負」ではなく「生 Tailwind を除去しトークン駆動クラスへ置換（Option A）」で行うのが最も安全。`data-theme-id`（DB の uuid）に加え、ビルド時に既知で安定な **`data-theme`（effectKey スラッグ: mori/umi/yoru/asa）** をルートへ付与し、バンドル CSS のトークン解決キーにする。

### 過去ロールバックの再発防止（テスト契約）

- **Context**: `mosaku-brand-theme` Phase A のヘッダー文字消失を二度と起こさない。
- **Sources Consulted**: `public/themes/mori/mori.css:58-63`（NOTE）/ `themes/mori.css.test.ts:105-189`。
- **Findings**: `mori.css.test.ts` は現在、(a) `.app-header`/`.app-sidebar` 不参照、(b) `.theme-root button|input|textarea` の要素型セレクタ禁止、(c) `.theme-root a` 直当て禁止（`.memo-content a` のみ許容）、(d) **テーマ対象を `.memo-title`/`.memo-content` に限定**、(e) 全トップレベルセレクタが `.theme-root` スコープ、を**テストで固定**している。
- **Implications**:
  - (b)(c) は本スペックの Requirement 1.4 と完全一致 → **そのまま維持**（玄関の彩色はクラス選択子のみで行い、要素型直当ては今後も禁止）。
  - (d) は本スペックが**意図的に覆す**（玄関へ拡張する）。ただし玄関の彩色は `public/themes/mori/mori.css` ではなく**バンドル層**（`tokens.css`/`primitives.css`）と、mori 固有テクスチャは fetch される `mori.css` の `[data-theme-id] .shell-*` クラスで行う。よって mori.css は引き続き `.theme-root` スコープを守れる＝(e) は維持可能。
  - テスト契約の更新点：mori.css に `.shell-*` クラス（クラス選択子）を許容するが要素型直当ては禁止のまま。トークン契約 AA 検証は新テスト（`tokens.contrast.test.ts`）で担保。design.md の Testing Strategy に明記する。

### 森の資産と二重背景（連続性）

- **Context**: Requirement 5.2「玄関〜本文で世界が断絶しない」/ G-4「二重背景」の整理。
- **Sources Consulted**: `components/effects/mori/MoriEffectLayer.tsx` / `ForestAnimationLayer.tsx` / `ParticleCanvas.tsx` / `hooks/useMoriEffectControl.ts` / `public/themes/mori/mori.css:4-56`。
- **Findings**:
  - `MoriEffectLayer`（fixed, z-0）が wave-pulse グラデ＋fog-drift 霧＋leaf-float 葉＋粒子を**全域に描画**。`useMoriEffectControl` が reduced-motion / エディタフォーカス / タブ非表示 / 3 秒アイドルの **4 条件で自動停止**（Requirement 5.3 の土台）。
  - 一方 `mori.css .theme-root` も `background: var(--theme-bg)` グラデ＋`::before/::after` 霧を描く＝**生きた背景が二重**。
- **Implications**: 「生きた世界の真実の源泉＝`MoriEffectLayer` に一本化」。玄関 surface は**半透明＋backdrop で背後の世界を透かす**ことで一体化させる（Requirement 5.2）。`html[data-theme="mori"]` に**静的フォールバック地色**だけ持たせ（pre-mount / reduced-motion 用）、シェルが不透明なグラデ板を二重に描かないようにする。`MoriEffectLayer`・`useMoriEffectControl` は**無改変**（Requirement 5.3, 7.4）。

### ブート経路と FOUC ウィンドウ

- **Context**: Requirement 2.3「未テーマの白いシェルが一瞬も見えない」の実現機構。
- **Sources Consulted**: `index.html` / `src/main.tsx` / `src/App.tsx`（`BrowserRouter`→`AuthGuard`→`AppContent`）/ `components/auth/AuthGuard.tsx`。
- **Findings**:
  - `index.html` の `<script type="module" src="/src/main.tsx">` は **defer 相当**＝モジュール実行前に `<body>`（白）がペイントされ得る。
  - `AuthGuard` は `loading` 中に**白背景の中央スピナー**を描画 → 認証解決後に Layout が mount → `useThemeCSS` の fetch 完了まで白シェル。**FOUC ウィンドウ = body 白 → スピナー（白） → 白シェル → テーマ済み**。
  - zustand `persist` ミドルウェアの採用実績なし／localStorage キー規約なし（`AuthContext` 等が個別利用）。
- **Implications**: FOUC を構造的に消すには **(1) `:root` に中立既定トークンをバンドル CSS で常時ロード（構造フラッシュ消去）**、**(2) `<head>` インライン同期スクリプトで localStorage のスラッグを first paint 前に `document.documentElement` へ適用し、`<html>` 地色をテーマ base に塗る**、**(3) primitive base クラスをバンドル（render-blocking）**。リッチなテクスチャは既存 code-split（fetch）で後追い適用（progressive enhancement＝白フラッシュではない）。

### CSS のみでの「質感」翻訳（Requirement 4）

- **Context**: 参照（ポケモンカードアプリ）の清潔感ある質感を**外部 JS ゼロ**で再現する手段の確認。
- **Sources Consulted**: 既存 `index.css` keyframes / `branding.md`「深掘りの型」/ `tailwind.config.js`（typography プラグインのみ・セマンティックカラー未配線）。
- **Findings**: テクスチャ＝多層 `linear/radial-gradient` ＋内側ハイライト（`box-shadow: inset …`）＋必要なら data-URI の微細ノイズ（外部リソース不要・`mori.css.test.ts` の `url()` 禁止は mori.css にのみ適用、バンドル層は対象外だが data-URI で代替可）。奥行き＝テーマ調整済みの多層 `box-shadow` エレベーション scale。余白＝スペーシングトークン。タイポ＝既存 `--theme-font-family`（游明朝）＋字階層トークン。マイクロインタラクション＝`transition` ＋ `@media (prefers-reduced-motion: reduce)` で動きのみ停止。
- **Implications**: 5 軸すべて CSS 変数＋クラスで表現可能 → 外部 JS 追加ゼロ（Requirement 7.2）を満たす。質感は「primitive クラス（構造・theme-neutral）× トークン値（テーマ固有）」に分離し、海・夜・朝は値差し替えで相乗り（Requirement 6）。

## Architecture Pattern Evaluation

> gap-analysis.md §4 の Option A/B/C を、確定方針（localStorage 永続＋Option C 主軸／各面 Option A 置換）に沿って具体化。

| Option                                             | 説明                                               | Strengths                                                                               | Risks / Limitations                                            | 判定                         |
| -------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------- |
| A: in-place 置換                                   | 玄関の生 Tailwind を除去しトークン駆動クラスへ置換 | 競合する `bg-white`/`text-gray-*` を**除去**＝詳細度戦争が起きない／FOUC を構造的に縮小 | 触る面が広い／非森ピクセル一致の担保が必要                     | **各面の彩色手段として採用** |
| B: class hook 上書き                               | 既存 Tailwind を残しクラスで上書き                 | 改修最小                                                                                | Tailwind が下に残り詳細度/ソース順依存＝過去事故領域の焼き直し | 不採用                       |
| C: トークン契約＋質感 primitive 層＋テーマ値パック | 契約・質感・値を 3 分離                            | spec の「基盤＋質感層＋相乗り」に最忠実／7.1・7.5 を中立既定値で構造担保／横展開最良    | 初期ファイル数最大・命名規律が要る                             | **全体構造として採用**       |

**結論**: C を全体構造に、各面の彩色は A（除去→置換）で実装する（gap-analysis 確定方針どおり）。

## Design Decisions

### Decision 1: アプリ単位テーマの出どころ＝localStorage 永続＋「シェル床／ノートブック上書き」優先順位

- **Context**: Requirement 2.1 の「ユーザーが森を有効にして開く」を満たす現在テーマの保持層が無い（G-1）。DB は不変（Requirement 7.3）。
- **Alternatives Considered**:
  1. User モデルにテーマ列を追加 — DB 変更が必要で 7.3 に反する。不採用。
  2. localStorage に選択テーマを永続し、シェルへ常時適用 — DB 不変と両立。採用。
- **Selected Approach**: `useShellThemeStore`（zustand, localStorage バック）が `{ id, slug }` を保持。`useActiveTheme` の解決を **`notebook/memo 文脈テーマ ?? shell テーマ（床） ?? null`** に拡張（ノートブックを開いている時はその テーマが上書き、それ以外＝Home/全メモ等ではシェルテーマが床として常時適用）。
- **Rationale**: gap-analysis 確定方針。DB 不変・既存ノートブックテーマ挙動を壊さず、Home/一覧でも「開いた瞬間に森」を成立させる。
- **Trade-offs**: localStorage はデバイスローカル（クロスデバイス同期なし）。本スペックは没入基盤が主目的のため許容（同期は将来 spec）。
- **Follow-up**: 永続キー `mosaku.shell-theme`。スラッグも保存し、Theme オブジェクト（server）未ロードでも FOUC 用トークンを即適用可能にする。

### Decision 2: 安定スラッグ属性 `data-theme` の導入

- **Context**: バンドル CSS のトークン解決キーが必要。既存 `data-theme-id` は DB uuid でビルド時不明。
- **Selected Approach**: ルート要素へ `data-theme={getEffectKey(theme)}`（mori/umi/yoru/asa）を **追加**（`data-theme-id` は既存挙動のため残置）。バンドル `tokens.css` は `[data-theme="mori"]` で値解決。`getEffectKey` は既存（`types/theme.ts`）。
- **Rationale**: スラッグはビルド時既知・安定・4 テーマ共通語彙（Requirement 6.2）。runtime 文字列置換に依存しない。
- **Trade-offs**: 属性が 2 つ並ぶ（`data-theme` 新／`data-theme-id` 既存）。役割が異なる（スラッグ＝バンドルトークン解決／uuid＝fetch CSS スコープ）ため許容。

### Decision 3: 3 層 CSS 分割で FOUC（2.3）と非森バンドル不増（7.5）を両立 ★最重要

- **Context**: 森トークン値をバンドルすれば FOUC は消えるが 7.5（非森の初期バンドル不増）に反する。code-split すれば 7.5 は守れるが初回が白い。両者は非妥協（2.3「一瞬も白を見せない」/ 7.5「森専用の追加 CSS/RAF を非森に読ませない」）。
- **Selected Approach**: シェル CSS を役割で 3 層に分離する。

  | 層              | 中身                                                                                                                                                                                                    | 配置                                                                                                           | render-blocking                  | 7.5 適合                                                                                                 |
  | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
  | ① 共有 base     | セマンティックトークンの**中立既定値**（`:root`）＋ **`[data-theme="mori"]` の全色・構造トークン値（色/状態/elevation/space/font, sub-KB）** ＋ 質感 primitive クラス（`.shell-*`、theme-neutral 構造） | バンドル（`index.css` import）                                                                                 | Yes                              | 適合（森専用の重量物でない＝色値は sub-KB の共有土台。中立値＝現状の見た目。テクスチャ/noise は③へ分離） |
  | ② critical vars | アクティブ slug の**コア変数のみ**（surface/on-surface と `<html>` 地色）。全 4 テーマ分の極小マップ（≒ `themeEffectRegistry` 同様の共有レジストリ）                                                    | バンドル小モジュール＋`<head>` インラインスクリプトが**localStorage の slug の分だけ** `:root`/`<html>` へ適用 | 適用は runtime（first paint 前） | 適合（非森 slug 永続時は森の値を適用しない。重量物でない）                                               |
  | ③ rich pack     | mori 固有の**重量テクスチャ（多層グラデ・data-URI noise・内側ハイライト）・本文面（.memo-title/.memo-content）のみ**（**色/構造トークン値は①が源泉ゆえ持たない**）                                      | `public/themes/mori/mori.css`（既存 fetch ローダーで mori 有効時のみ取得）                                     | No（progressive）                | 適合（mori 有効時のみネットワーク取得。非森は一切読まない）                                              |

- **Rationale**: 「白フラッシュ（FOUC）」の正体は**白い面**。①の中立既定で構造フラッシュを消し、②で first paint 前に `<html>` 地色と surface/on-surface をテーマ base に塗れば**白は一瞬も出ない**（2.3）。**mori の色/構造トークン値は①の `[data-theme="mori"]` に置き first paint で確定する**ため、accent/outline/elevation の「半テーマ窓」も出ない（②は `<html>` 地色の belt-and-suspenders に限定）。③のリッチテクスチャ（重量物のみ）は後追い適用＝progressive enhancement であり「白→テーマ」のフラッシュではない。森専用の重量物（③のテクスチャ・RAF エフェクト）は mori 有効時のみロード＝非森バンドル不増（7.5）。RAF エフェクトは既存 `themeEffectRegistry` の code-split で既に分離済み。
- **Trade-offs**: 層が 3 つで moving parts が増える。ただし各層は固有の hard requirement（①=7.1 中立／②=2.3 FOUC／③=7.5 分離）に 1:1 対応し、過剰設計ではなく要件の緊張関係の解。②の slug→core-vars マップは全テーマ分をバンドルに含む（sub-KB・既存 effectKey レジストリと同性質）＝「森専用 CSS」ではなくテーマ共通インフラとして扱う。
- **Follow-up**: ②の `<head>` インラインスクリプトは依存ゼロ・例外安全（localStorage 不可でも throw しない）で書く。CSP（helmet）との整合のため nonce 不要な最小スクリプトにするか、外部小 JS にするかは impl で確認（Open Question）。

### Decision 4: 「サイドバー」＝ Header 内ナビ領域と読み替え

- **Context**: requirements は「サイドバー」を繰り返すが、独立サイドバーは存在せず、ナビは `Header.tsx` 内の横並びボタン（G-5）。
- **Selected Approach**: 本スペックでは「サイドバー」を **Header のナビゲーション領域**と定義し、新規サイドバー化は行わない（スコープ膨張回避）。
- **Rationale**: requirements の意図は「玄関ナビが世界になっていること」。新レイアウト追加は非スコープ。
- **Trade-offs**: 将来サイドバー化する場合は別 spec。トークン契約は再利用可能。

### Decision 5: 半透明 surface のコントラスト AA を「base 合成 solid 等価色」で保証・機械検証

- **Context**: surface を半透明にすると背後の生きた世界（明滅）により on-surface のコントラストが非決定的になり、3.x（AA）/3.5（検証テスト）と矛盾しうる。
- **Selected Approach**: 各 mori surface は **アルファを十分高く（scrim 化）**する。`MoriEffectLayer` は無改変（5.3）で効果側を暗く制約できない（`ParticleCanvas` は `#ffffff`/`#fbbf24` 粒子を opacity 0.8〜1.0、霧は `rgba(255,255,255,…)`）。したがって **worst-case 床＝最明の透け色 `#ffffff`** と定義し、テストは `--surface`(rgba) を (1) `--shell-base-bg`(solid) と (2) `#ffffff` の**両床**へアルファ合成し、**worst-case 床(#ffffff)の合成色でも** `--on-surface` 本文 ≥ 4.5:1／低強調・非テキスト UI ≥ 3:1 を満たす surface alpha 下限を要件とする（本文 4.5:1／大字・非テキスト UI 3:1）。これにより背後がどれだけ明るく明滅しても AA を割らない。
- **Rationale**: `mori.css.test.ts` の CSS 値パース先例を踏襲し決定的に検証可能（3.5）。半透明でも「最低でも scrim 合成色で AA」を保証すれば実機でも破綻しない。
- **Trade-offs**: surface を暗め・やや不透明寄りにする制約。完全な透明感より可読性を優先（branding「可読性」原則と一致）。

## Risks & Mitigations

- **R1 詳細度の再発（ヘッダー文字消失）** — 玄関の生 Tailwind を**除去**（Option A）し要素型直当てを使わない。`mori.css.test.ts` の要素型禁止テストを維持。レビューで各置換の勝敗を 1 つずつ確認。
- **R2 FOUC が残る** — Decision 3 の ①②を必須化。E2E で「初回ペイントに白 surface が出ない」を `data-theme` 属性＋背景色で検証。
- **R3 非森リグレッション（7.1）** — 中立既定トークンを**現行の生 Tailwind 値と一致**させ、非森スナップショット/ビジュアル回帰で担保。`data-theme` 未設定時は ① のみ適用＝現状同等。
- **R4 半透明 surface の可読性破綻（3.x）** — Decision 5 の **worst-case(白床 `#ffffff`)合成 AA テスト**＋ scrim 設計。低強調テキスト（on-surface-variant）も下限を持つ。
- **R5 二重背景のちらつき（G-4）** — 生きた背景を `MoriEffectLayer` に一本化、シェルは静的フォールバック地色のみ。`MoriEffectLayer`/`useMoriEffectControl` 無改変。
- **R6 質感の過剰設計（単一テーマに作り込みすぎ）** — primitive は「surface / card / nav-item / field / button」の必要最小セットに限定。海・夜・朝の値受け皿（コメント placeholder）のみ用意し実装は後続（6.4）。
- **R7 CSP とインラインブートスクリプト** — helmet の CSP と整合するか impl 初手で確認（Open Question）。不可なら外部最小 JS へ退避。

## References

- [WCAG 2.1 — Contrast (Minimum) 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) — 本文 4.5:1 / 大字 3:1。relative luminance 計算式の正典（3.5 テストの算出根拠）。
- [WCAG 2.1 — Non-text Contrast 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html) — フォーカスリング・状態表示・境界の 3:1（3.3）。
- 既存資産: `public/themes/mori/mori.css` / `components/effects/mori/MoriEffectLayer.tsx` / `hooks/useMoriEffectControl.ts` / `themes/mori.css.test.ts` / `themes/themeEffectRegistry.ts`。
- steering: `branding.md`（深掘りの型 6 カ条）/ `structure.md`（テーマ機構の配置規約）/ `tech.md`（CSS keyframes + Canvas のみ・外部 JS 追加禁止方針）。
