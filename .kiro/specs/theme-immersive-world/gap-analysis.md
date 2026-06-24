# 実装ギャップ分析 — theme-immersive-world

> 承認済み requirements（`requirements.md`）と既存コードベースの差分を分析し、design フェーズの判断材料を提供する。
> **本書は情報提供であり意思決定ではない。** 複数の実装アプローチを提示し、未知点は「Research Needed」として明示する。

## 分析サマリー

- **森の"世界"は既に全域に描画済み。本当の宿題は上に乗る不透明な白い「フタ」を外すこと。** `ThemeEffectHost`→`MoriEffectLayer`（`position: fixed; inset:0; z-0`）が背景グラデ・霧・葉・粒子をアプリ全域に描いている。一方ヘッダー・メモ一覧・カード・ホームは生 Tailwind（`bg-white` / `text-gray-*`）で世界にフタをしている。
- **最大の構造ギャップは「玄関の没入」ではなく「玄関に届けるテーマの出どころ」。** 現状テーマは**ノートブック単位**でしか解決されない（`useActiveTheme.ts:22`）。User モデルにテーマ列はなく（`schema.prisma` User）、localStorage 永続化も無い。ゆえに「森テーマを有効にしてホーム/全メモを開く」と `activeTheme === null` → 素の白シェルになる。Requirement 2.1 の前提（アプリ単位で森が有効）を満たす受け皿が存在しない。
- **トークン語彙が"面（surface）"を持っていない。** 全4テーマ共通の `--theme-text/heading/accent/border-color` は「グラデの上に透ける没入**本文面**」用で、不透明パネル（ヘッダー/カード）の地色＋その上の文字（surface×on-surface ペア）という概念が無い。Requirement 1 は既存語彙の**拡張**を要する。
- **過去の地雷は再現可能な形で記録済み＝設計で確実に回避できる。** `mosaku-brand-theme` Phase A は `.app-header` クラス＋`.theme-root button`/`input` という**要素型セレクタ**で全体適用し、Tailwind `text-gray-600` と詳細度が衝突してヘッダー文字が消失→ロールバック（`design.md:245-246`、現 `mori.css:58-63` の NOTE）。Requirement 1.4「要素型セレクタ禁止／面側にトークン適用」はこの教訓の直接の処方箋。
- **総合規模 L（1〜2週間）／リスク中〜高。** 新規ライブラリ・DB 変更ゼロ（familiar tech）でリスクは下がるが、(a) アプリ単位テーマの出どころ、(b) FOUC 回避、(c) 主観的な「質感」の作り込みが未知点。

---

## 1. 現状調査（Current State）

### 1.1 テーマ適用の仕組み

| 要素           | 実体                                                                                                                                     | 備考                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------- | --- | ----- | --------------------------------------------------------------------- |
| テーマ CSS     | `frontend/public/themes/{name}/{name}.css`（mori/umi/yoru/asa）                                                                          | DB にはメタデータ＋パスのみ（`tech.md` 不変則） |
| ロード         | `useThemeCSS.ts`：useEffect 内で `fetch()` → `.theme-root` を `[data-theme-id="<id>"]` に置換し `<style>` 注入（`:29-39`）               | **非同期 = 初回ペイント後に適用 → FOUC 不可避** |
| 二重ローダー   | `utils/themeLoader.ts`（`loadThemeCSS`、`.theme-root[data-theme-id]` に置換）も存在するが、シェルの能動経路は `useThemeCSS`              | 軽微な技術的負債（スコープ規約が2系統）         |
| ルート付与     | `DesktopLayout.tsx:134-136` / `MobileLayout.tsx:118-120`：`className="… bg-white ${activeTheme ? 'theme-root' : ''}"` ＋ `data-theme-id` | ルート div に `bg-white` が常時同居             |
| アクティブ解決 | `useActiveTheme.ts:22`：`selectedNotebook?.theme                                                                                         |                                                 | memo?.notebook?.theme |     | null` | **ノートブック文脈のみ。アプリ/ユーザー単位の「現在のテーマ」は無い** |

### 1.2 玄関（シェル）コンポーネントの彩色実態 — すべて生 Tailwind

| 面         | ファイル                                                                       | ハードコード例                                                                             |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| ヘッダー   | `ui/Header.tsx:52`                                                             | `bg-white border-gray-200` / nav `text-gray-600` / active `bg-blue-100 text-blue-800`      |
| メモ一覧   | `memo/MemoList.tsx`                                                            | 見出し `text-gray-900` / 入力 `border-gray-200 focus:ring-blue-500` / ボタン `bg-blue-500` |
| メモカード | `memo/MemoItem.tsx:17`                                                         | `bg-white border-gray-200 hover:border-blue-500 hover:shadow-md`                           |
| ホーム     | `home/HomeDashboard.tsx` ＋ 6子（Hero/Recent/Weekly/Calendar/Notebook/Prompt） | 各子が個別に Tailwind 配色                                                                 |

→ Requirement 1.4 が禁ずる「生のカラーリテラル直書き」が玄関全面に分散。**サイドバーという独立コンポーネントは存在せず**、ナビは Header 内の横並びボタン（後述ギャップ参照）。

### 1.3 森の資産（再利用可能・既に全域マウント済み）

- `effects/ForestAnimationLayer.tsx`：グラデ（`wave-pulse`）＋霧（`fog-drift`）＋葉（`leaf-float`）。`LoginPageLayout` と `MoriEffectLayer` の双方が共用。
- `effects/ParticleCanvas.tsx`：マウス追従粒子（`pointer: coarse` では非マウント）。
- keyframes は `index.css`（グローバル＝ログイン用）と `mori.css`（スコープ版）の両方に存在。
- `MoriEffectLayer`（`effectKey` 経由で `ThemeEffectHost` が `React.lazy` マウント）＝ **森背景は mori 有効時に既にアプリ全域へ fixed 描画されている**。
- 自動停止4条件は `useMoriEffectControl.ts`（reduced-motion / エディタフォーカス / タブ非表示 / 3秒アイドル）で実装済み → Requirement 5.3・4.6 の土台あり。

### 1.4 規約・テスト・データ面

- 規約：`frontend/src/index.css` に `@tailwind base/components/utilities` ＋ `:root` 起点のグローバル CSS。`tailwind.config.js` は概ね既定（typography プラグイン＋`darkMode:'class'`）で、**セマンティックカラーは Tailwind に未配線**。
- テスト：`themes/mori.css.test.ts` が CSS 値を検証する先例あり → Requirement 3.5（コントラスト検証テスト）はこのパターンを拡張可能。
- データ：`Notebook.themeId`（`schema.prisma:91`）と `UserFavoriteTheme`（お気に入り）のみ。**User に "選択中テーマ" 列は無い** → Requirement 7.3（DB 不変）と両立するなら永続先は localStorage が筆頭候補。

---

## 2. Requirement → 資産マップ（ギャップ種別: 🔴Missing / 🟡Unknown / 🟢Constraint）

| Req                            | 必要な技術要素                                                                                                                  | 既存資産                                                           | ギャップ                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** セマンティックトークン   | surface / surface-variant / on-surface / on-surface-variant / outline / accent をペアで定義し、要素型セレクタを使わず面側へ適用 | `--theme-text/heading/accent/border` のみ（本文面用・面概念なし）  | 🔴 surface 系トークン層が未定義（新規語彙）。🟢 要素型セレクタ禁止（過去ロールバックの制約）                                                                           |
| **2** 玄関の全体没入           | 玄関各面を surface に置換／FOUC なし初期表示／Desktop・Mobile 両対応／導線非破壊                                                | 森背景は全域描画済み。シェルは `bg-white` でフタ                   | 🔴 各面の `bg-white`/`text-*` 置換が未実装。🔴 **アプリ単位「森 ON」状態の出どころが無い**（2.1 の前提）。🟡 FOUC 回避策（現機構は非同期 fetch）                       |
| **3** 可読性・コントラスト     | 全玄関面 WCAG AA／状態表示の可視化／低強調テキスト下限／検証テスト                                                              | `mori.css.test.ts` の CSS 値テスト先例                             | 🔴 surface×on-surface のコントラスト保証＆テストが未整備。🟢 AA を要件として固定                                                                                       |
| **4** 脱・ありきたり質感       | テクスチャ／エレベーション／余白スケール／游明朝タイポ階層／マイクロインタラクション／reduced-motion で動きのみ停止             | 游明朝は `--theme-font-family` にあり。`useReducedMotion` 実装済み | 🔴 質感プリミティブ層（カード/面/ナビの作り込み）が未存在。🟢 外部JS追加ゼロ・CSS/既存フックのみ                                                                       |
| **5** 玄関〜本文の連続性       | 森資産再利用／シェルと本文の境目で世界が断絶しない／既存JSエフェクト基盤と共存／本文面の見た目非後退                            | 森資産・本文面 CSS・エフェクト基盤すべて既存                       | 🔴 シェル surface を**半透明/エレベーション**で「一つの世界」に溶かす設計が未着手。🟡 `mori.css` の `--theme-bg` グラデと `MoriEffectLayer` グラデの**二重背景**の整理 |
| **6** 海・夜・朝の相乗り       | テーマ固有値を外出し／コード非変更で値差し替え／明暗反転に耐えるトークン契約／本スペックは森のみ実装                            | 4テーマが同一語彙 `--theme-*` を共有する先例                       | 🔴 surface 語彙を4テーマ共通契約として定義し、明（asa）でも暗（mori）でも成立する形にする設計                                                                          |
| **7** 非干渉・軽量・データ不変 | 非森テーマは実装前と同一描画／外部JS追加ゼロ／CSS＋メタデータのまま／認証・編集に副作用なし／非森ユーザーのバンドル不増         | コード分割・effectKey 動的ロード基盤が既存                         | 🟢 トークン中立既定値を `:root` に置けば非森＝現状維持（構造的に担保可）。🟡 質感層を森限定チャンクに閉じ込める分割設計                                                |

---

## 3. 主要ギャップの深掘り（design で要決着）

### G-1. 「アプリ単位の森 ON」の出どころ【最重要・Missing】

現状テーマはノートブック従属（`useActiveTheme.ts:22`）。`mosaku-brand-theme` 設計のデモ動線も「mori **ノートブックを選択** → 全域に森」であり、**ノートブック文脈に依存しない"開いた瞬間に森"は元々未達**。Requirement 2.1 を満たすには「ユーザーが選んだシェルテーマ」を保持する層が要る。
→ 候補：**localStorage に選択テーマ ID を永続**（Req 7.3 の DB 不変と両立）。シェルルートへ常時適用し、ノートブック内ではノートブックテーマが上書き（または localStorage を全体の床にする）。**起動時同期読み出しは G-2（FOUC）回避とも直結**。

### G-2. FOUC【Unknown→設計必須】

`useThemeCSS` は useEffect 内 async fetch（`:29-39`）＝初回ペイントは無テーマ→白。Requirement 2.3「白いシェルが一瞬も見えない」と矛盾。
→ 研究方針：(a) 中立トークン既定値を常時ロードの `index.css :root` に置き構造的フラッシュを消す、(b) localStorage のテーマ ID を first paint 前（`index.html` ブートまたは `main.tsx` のマウント前）に `data-theme-id` としてルートへ付与、(c) mori トークンの critical 部分をインライン/preload。

### G-3. 詳細度・要素型セレクタの再発防止【Constraint】

過去は `.theme-root button`（→`[data-theme-id] button` = 0,1,1）が Tailwind `text-gray-600`（0,1,0）に勝ち、白背景で文字が白化。
→ 不変則：**汎用 HTML 要素（button/a/input）への文字色直当て禁止**。トークンは「面側」に当て、文字は各面コンポーネントが**クラス経由**で `var(--on-surface)` を参照。レビューでは各上書きが実際に競合に勝つか（詳細度＋ソース順）を1つずつ確認。

### G-4. 二重背景と「世界の連続性」【Unknown】

`mori.css .theme-root` は `--theme-bg` グラデ＋`::before/::after` 霧を描き、同時に `MoriEffectLayer` も別途グラデ＋霧＋葉＋粒子を fixed 描画。両者が重なる。
→ Requirement 5.2 を満たす鍵は「シェル surface を不透明な板にしない」こと。surface を半透明＋エレベーションで設計し、背後の生きた世界（エフェクト層）を透かして一体化させる。design で背景の責務分担（CSS グラデ vs エフェクト層）を一本化すべき。

### G-5. 「サイドバー」の不在【要件・実装の用語ズレ】

Requirements は繰り返し「サイドバー」を挙げるが、独立サイドバーは存在せず、ナビは `Header.tsx` 内の横並びボタン。
→ design で「サイドバー＝ヘッダー内ナビ領域」と読み替えるか、別途サイドバー化するかを明確化（スコープに影響）。

---

## 4. 実装アプローチ（Option A / B / C）

> 軸は「**トークンを玄関の各面へどう届けるか**」。いずれも玄関コンポーネントへの着手は不可避（純 CSS のみでの無改修適用は、生 `bg-white`/`text-gray-*` の存在ゆえ不可）。

### Option A — コンポーネント内 Tailwind リテラルをトークン駆動へ置換（Extend in-place）

玄関各面の `bg-white`→`bg-[var(--surface)]`、`text-gray-900`→`text-[var(--on-surface)]` 等へ直接置換。トークン中立既定値は `:root`、mori.css は `[data-theme-id]` で**値のみ**上書き。

- ✅ 競合する `bg-white`/`text-gray-*` を**除去**するので詳細度戦争が起きない（最も安全に過去地雷を回避）
- ✅ 中立既定値が常時ロード CSS にあり FOUC を構造的に縮小（白→テーマの構造フラッシュが消え、残るは値の色味遷移のみ）
- ❌ 触るコンポーネントが広い（浅いが多数）。非森＝現状ピクセル一致の担保が必要（Req 7.1）
- ❌ `bg-[var(--x)]` の arbitrary value が増殖し冗長化しやすい

### Option B — 玄関にセマンティッククラスを付与し CSS 側で上書き（Add class hooks）

コンポーネントに `.app-header` / `.entry-card` / `.entry-surface` 等を**追加**（既存 Tailwind は残す）し、`mori.css` で `[data-theme-id] .app-header { background: var(--surface); color: var(--on-surface); }`。クラススコープ（0,2,0）で Tailwind（0,1,0）に勝ち、かつ要素型を使わない。

- ✅ コンポーネント改修が最小（クラス付与のみ）＝ 差分小・ロールバック容易
- ✅ クラス限定で「狙った面だけ」着色（過去の要素型セレクタ問題を正しく解消）
- ❌ Tailwind リテラルが下に残り、上書きは詳細度／ソース順の理解前提（=過去に事故った領域。今回は正しくやる）。**実質「ロールバックされた設計の正しい焼き直し」**
- ❌ FOUC は別途対応が必要

### Option C — ハイブリッド：トークン契約 ＋ 質感プリミティブ層 ＋ テーマ値パック（Recommended 候補）

1. `index.css :root` に**中立既定値**でセマンティックトークンを定義（非テーマ＝現状維持・FOUC 安全）。
2. トークンを読む**質感プリミティブ**（Surface / Card / NavItem などのクラスまたは小コンポーネント）を新設 ＝ Requirement 4（テクスチャ/奥行き/余白/タイポ/マイクロインタラクション）の置き場。
3. `mori.css` は `[data-theme-id]` で**トークン値＋森固有テクスチャ**を上書き。
4. umi/yoru/asa は将来、同契約に値を与えるだけで相乗り（Req 6）。

- ✅ spec が掲げる「基盤＋質感層＋相乗り」の枠組みに最も忠実。Req 1/4/6 を構造的に分離
- ✅ FOUC・非森非干渉（Req 7.1/7.5）を中立既定値で構造的に担保
- ✅ 横展開ストーリーが最良
- ❌ 初期設計とファイル数が最大。トークン命名とコンポーネント棚卸しに規律が要る
- ❌ 単一テーマのスライスにプリミティブ層を作り込みすぎる過剰設計リスク

---

## 5. Effort & Risk

| 項目                     | 評価              | 一言根拠                                                                                                                                                |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **総合 Effort**          | **L（1〜2週間）** | トークン設計＋玄関全面（ヘッダー/一覧/カード/ホーム）改修＋質感層＋FOUC/アプリテーマ機構＋コントラストテスト。統合点は多いが新規ライブラリ・DB 変更なし |
| **総合 Risk**            | **中〜高**        | 詳細度ロールバックは原因特定済みで処方箋明確（→低下要因）。一方 FOUC・アプリ単位テーマの出どころは未知、「質感」は主観的で反復前提（→上昇要因）         |
| G-1 アプリテーマ出どころ | 中                | localStorage で DB 不変と両立可だが、ノートブックテーマとの優先順位設計が必要                                                                           |
| G-2 FOUC                 | 中〜高            | 現機構（非同期 fetch）からの脱却＝ブート経路への介入。Req 2.3 は妥協不可                                                                                |
| G-3 詳細度               | 低〜中            | 要素型セレクタ禁止＋クラス/面側適用で構造的に回避可。レビューで各上書きの勝敗を確認                                                                     |
| G-4 二重背景・連続性     | 中                | 背景責務の一本化と半透明 surface 設計。視覚回帰が出やすい                                                                                               |
| Req 4 質感               | 中〜高            | 定量軸（5軸）はあるが「ポケポケ級」は主観。デザインレビュー反復を見込む                                                                                 |

---

## 6. design フェーズへの推奨

### 確定方針（2026-06-25・design 入力）

- **G-1 アプリ単位テーマの出どころ＝localStorage で永続。** 選択テーマ ID を localStorage に保存しシェルへ常時適用（DB 不変 Req 7.3 と両立）。ノートブック内ではノートブックテーマが上書き。起動時の同期読み出しを FOUC 回避（G-2）と一体で設計する。
- **実装の主軸＝Option C（トークン契約＋質感プリミティブ層）。各面の着色は Option A（生 Tailwind 除去→トークン置換）で実装。** 過去ロールバックを最も安全に回避しつつ、umi/yoru/asa の相乗り基盤を確立する。

### 推奨アプローチ

**Option C（ハイブリッド）を主軸に、初期スライスは Option A の置換戦略で実装**するのが有力。理由：spec が明示的に「森で基盤（トークン層＋質感層）を確立し3テーマが相乗り」を目的化しており、トークン契約と質感プリミティブの分離（C）が要件構造に最も整合する。一方で過去ロールバックの確実な回避には「競合 Tailwind を残して上書き（B）」より「除去して置換（A）」が安全なため、各面の着色は A の方式で行う。

### design で確定すべき主要判断

1. **アプリ単位テーマの出どころと永続先**（localStorage か／ノートブックテーマとの優先順位）— G-1。
2. **FOUC 回避の具体機構**（中立既定値＋ブート時同期適用 vs preload/インライン）— G-2。
3. **セマンティックトークンの正式語彙**（surface / surface-variant / on-surface / on-surface-variant / outline / accent ＋ 状態 hover/focus/selected）と、明暗反転に耐える契約 — Req 1/6。
4. **背景の責務分担**（`mori.css` グラデと `MoriEffectLayer` の二重描画を一本化、surface は半透明＋エレベーション）— G-4。
5. **「サイドバー」の定義**（ヘッダー内ナビと読み替えるか別実装か）— G-5。
6. **質感プリミティブの粒度**（クラスのみ vs 小コンポーネント。単一テーマで過剰設計しない境界）— Req 4。

### Research Needed（design で調査）

- 🟡 **FOUC**：Vite/PWA 環境で first paint 前にテーマ ID を確定し CSS を当てる最小手段（`index.html` ブート注入／critical CSS インライン／preload の比較）。
- 🟡 **コントラスト検証の自動化**：`mori.css.test.ts` を拡張し surface×on-surface ペアの WCAG AA を機械検証する方式（CSS 値パース vs 算出 API）— Req 3.5。
- 🟡 **二重背景の統合**：シェル surface 半透明化時、`MoriEffectLayer`（z-0 fixed）との重なり順・可読性（text-shadow 等）への影響。
- 🟡 **質感の翻訳**：参照（ポケモンカードアプリ）の「テクスチャ/奥行き/清潔感」を CSS（多層グラデ・内側影・微細ノイズ）でどこまで外部JSなしに再現できるか。

### 次のステップ

- 本ギャップ分析を踏まえ `/kiro:spec-design theme-immersive-world` で技術設計を作成。
- 設計では特に G-1（アプリテーマ出どころ）と G-2（FOUC）を先に決着させること（後段のトークン/質感設計がこれに依存するため）。

---

_Generated by `/kiro:validate-gap`（情報提供・複数案提示・未知点の明示を原則とする）_
