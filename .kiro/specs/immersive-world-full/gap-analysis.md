# Implementation Gap Analysis — immersive-world-full

先行スペック **theme-immersive-world** が玄関（メモ一覧・ホーム・ヘッダー）に確立した「セマンティックトークン契約＋質感 primitive 層（`.shell-*`）＋森リッチパック」を、玄関を出た先の全ドメイン（memo編集・tag・notebook・settings・public・modal/overlay）へ展開する。本書は承認済み要件（requirements.md）と現行コードベースのギャップを分析し、設計フェーズの意思決定材料を提供する。

> **本書の位置付け**: 情報提供であり意思決定ではない。複数の実装オプションと、設計フェーズへ持ち越すべき研究項目・制約衝突を明示する。

---

## 1. Analysis Summary

- **G1/G2/G3 の大半は「玄関の轍を辿る機械的展開」で低〜中リスク**。トークン層（`tokens.css`）と primitive 層（`.shell-*`）は既に存在し契約も固い。対象は memo/tag/notebook/settings/public に散る**約25の生 Tailwind 残存コンポーネント＋モーダル数点**。ドメイン単位・1 Todo=1 Commit で刻める。
- **🚨 最大の障害は Requirement 4（公開ビュー）と Requirement 8.3（backend/DB 不変）の正面衝突**。公開メモ API は `{ title, content, updatedAt }` **のみ**を返し、テーマ情報（slug / cssFilePath）を一切含まない。「コンテンツのテーマで公開ビューを描画」（R4.1）は backend 不変のままでは**技術的に不可能**。設計前に要件かスコープの調整が必須。
- **R2.4「本文とシェルの境目で世界が断絶しない」は 2 系統ブリッジ問題**。メモ本文面（`.memo-content`）は**旧 `.theme-root` ＋ `--theme-*` 変数**で彩色、シェル面は**新 `.shell-*` ＋ `--shell-*` トークン**で彩色。名前空間が異なる 2 系統を、G4（`.theme-root` 一本化＝非スコープ）に踏み込まずに視覚的連続させる設計判断が要る。
- **G2 三役タイポ・G3 構造装置は純粋な追加**。現行は単一 `--shell-font` のみ。`--shell-font-display/mono/body` への分割と `.shell-eyebrow`/`.shell-chip`/番号付きセクションは既存契約に足すだけで、素材（游明朝・monospace）も揃っており低リスク。
- **モーダル/オーバーレイは汎用 primitive 不在**。`SyncToast`/`FeedbackModal`/`FocusMemoOverlay` は各自ベスポーク。スクリム（backdrop）トークンが未定義で、R3 は新 primitive の追加が必要。

**総合見立て**: 全体 **L（1〜2週間）** ／ R4 を除けば **Medium リスク**、R4 を含むと **High リスク**（backend 契約衝突が長い棒）。

---

## 2. Current State Investigation（現行コードベース）

### 2.1 テーマ機構は 2 系統が共存している（最重要の前提）

| 系統                  | トリガ                                                                                                     | セレクタ / 変数                                                                    | 所有                                                                                             | 対象                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **新・シェル系**      | `useShellThemeStore` → `<html data-theme="mori">`（`DesktopLayout`/`MobileLayout` も `data-theme` を付与） | `[data-theme='mori']` ＋ `--shell-*` / `--surface*` トークン、`.shell-*` primitive | Layer①=`src/themes/shell/{tokens,primitives}.css`（`index.css` から `@import`、render-blocking） | 玄関のシェル面（Header・一覧・カード）                        |
| **旧・theme-root 系** | `themeLoader.ts` / `themeApplier.ts` → `.theme-root[data-theme-id="xxx"]`                                  | `.theme-root` ＋ `--theme-*` 変数                                                  | Layer③=`public/themes/mori/mori.css`（mori 有効時のみ fetch）                                    | メモ本文面（`.memo-title` / `.memo-content`）＋重量テクスチャ |

- **2 系統は `mori.css` で接続済み**: Layer③ の `mori.css` は `.theme-root .memo-content`（旧・本文面）**と** `.theme-root .shell-surface/.shell-panel/.shell-card`（新・primitive 面へ森テクスチャを後追い）の**両方**を彩色する。色トークンの単一の源泉は Layer①、Layer③ は重量テクスチャのみ重ねる分業。
- **G4（`.theme-root` 一本化）は本スペック非対象**。したがって本文面は当面 `--theme-*`、シェル面は `--shell-*` の二重管理が続く前提で設計する。

### 2.2 玄関は移行済み（辿るべき先例）

`.shell-*` 適用済み＝**先例として踏襲すべき**コンポーネント: `ui/Header.tsx`・`memo/MemoList.tsx`・`memo/MemoItem.tsx`・`home/RecentMemoCard.tsx`・`theme/ShellThemeSelector.tsx`。
移行の非破壊性はテストで担保済み: `layouts/shellImmersionNonDestructive.test.tsx`・`shellImmersionRouting.test.tsx`・`stores/useShellThemeStore.test.ts`・`themes/mori.css.test.ts`・`tokens.contrast.test.ts`（surface×on-surface の白床 worst-case 合成でAA検証）。

### 2.3 生 Tailwind 残存コンポーネント（G1 対象の実体）

対象ドメインで生カラーリテラル（`bg-white`/`text-gray-*`/`bg-blue-*`/`border-gray-*` 等）を含む非テスト tsx:

| ドメイン          | ファイル数 | ファイル                                                                                                               |
| ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| **memo編集**      | 7          | `MemoEditor`・`MemoList`(部分移行済)・`MemoSearch`・`MemoPalette`・`TrashView`・`ShareMemoControl`・`FocusMemoOverlay` |
| **tag**           | 8          | `TagForm`・`TagInput`・`TagFilter`・`TagSelector`・`TagManager`・`TagChip`・`TagDisplay`・`TagDropdownIcon`            |
| **notebook**      | 2          | `NotebookList`・`NotebookEditor`                                                                                       |
| **settings**      | 3          | `SettingsPage`・`InvitationCard`・`PublicMemosCard`                                                                    |
| **public**        | 3          | `PublicMemoPage`・`PublicMemoView`・`PublicMemoRenderer`                                                               |
| **modal/overlay** | +2         | `feedback/FeedbackModal`・`ui/SyncToast`（`FocusMemoOverlay`・`TagDropdownIcon` は上で計上済）                         |

合計 **≈25 の判別ファイル**（`MemoList` 等は部分移行済で残存リテラルあり）。要件の「33 コンポーネント」はサブコンポーネント・部分移行分を含めた見積りとして妥当なオーダー。auth/login 系（`OAuthLoginButton`・`PasswordInput` 等）は別スペック（login-visual-redesign）領域で本スコープ外。

### 2.4 エディタファクトリは編集↔公開で共有済み（R4.4 の土台は既にある）

`createEditorExtensions.ts`（共有ファクトリ）を編集用 `RichTextEditor.tsx` と公開表示用 `public/PublicMemoRenderer.tsx` の**両方**が使用。→ 本文（ProseMirror）レンダリングの拡張は既に一致しており、「編集時と公開時で本文の世界観に差異を生まない」（R4.4）は構造的に満たせる素地がある。

### 2.5 モーダル/オーバーレイは汎用 primitive が無い

`ui/SyncToast`・`feedback/FeedbackModal`・`memo/FocusMemoOverlay`・`tag/TagDropdownIcon` は各自ベスポーク実装。共通の Modal/Dialog primitive も**スクリム（backdrop）トークンも未定義**。R3 はここへ `--scrim` 系トークン＋`.shell-overlay`/`.shell-scrim` 相当の追加が必要。

### 2.6 タイポ・構造装置の現況（G2/G3 の起点）

- **G2**: 現行は単一 `--shell-font`（mori では游明朝、中立ではシステムフォント）。三役（`--shell-font-display/mono/body`）は**未実装**。ただし素材は在庫あり（游明朝＝display、monospace＝mono〔`mori.css` の `code` で使用中〕、システムフォント＝body）。
- **G3**: `.shell-eyebrow`・`.shell-chip`・番号付きセクションは `primitives.css` に**存在しない**。純粋な新規追加。

### 2.7 併走中の変更（コーディネーション注意）

git status 上で **content-jsonb-migration**（`editor/contentSync.ts`・`utils/editor/prosemirrorText.ts` 新規、`prisma/schema.prisma` 変更、cutover マイグレーション群）が進行中。メモ本文の格納が HTML→JSONB へ移行中で memo 編集ドメインに同時に触れている。**presentation（CSS/クラス）と content 格納は直交**だが、`.memo-content` の DOM 構造・クラス安定性に依存する本スペックとは編集面で衝突しうる。

---

## 3. Requirement-to-Asset Map

タグ: `[Extend]`=既存資産の拡張で対応 / `[New]`=新規作成 / `[Missing]`=現状欠落 / `[Unknown]`=要研究 / `[Constraint]`=制約・衝突。

| Req              | 内容                                                | 既存資産                                                                            | ギャップ                                                                             | 判定                       |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| **R1**           | 全ドメインのトークン駆動化・生Tailwind排除          | `.shell-*`/tokens 契約、玄関先例、`tokens.contrast.test.ts`                         | ≈25ファイルの機械的移行。表現できない面は primitive/トークン拡張（R1.4）             | `[Extend]`                 |
| **R2.1-2.3**     | 玄関〜本文〜設定の没入連続・半透明surface・FOUC無し | `--app-shell-bg: transparent`、`--surface-backdrop: blur()`、Layer① render-blocking | 各ドメイン画面をシェル面配下に載せる。settings/notebook が `.app-shell` 配下か要確認 | `[Extend]` `[Unknown]`     |
| **R2.4**         | 本文面とシェル面の世界観連続                        | `.memo-content`(旧`--theme-*`) と `.shell-*`(新`--shell-*`)                         | **2系統の名前空間ブリッジ**。G4非スコープ制約下での連続化設計                        | `[Constraint]` `[Unknown]` |
| **R3**           | モーダル/オーバーレイの没入                         | ベスポークな `SyncToast`/`FeedbackModal`/`FocusMemoOverlay`                         | **スクリムトークン＋overlay primitive が欠落**。フォーカストラップ等の非破壊         | `[Missing]` `[New]`        |
| **R4.1**         | 公開ビューをコンテンツのテーマで描画                | 公開ページはテーマ適用**ゼロ**（`data-theme`/`.theme-root` 無し・生Tailwind）       | **公開API が theme を返さない**（`{title,content,updatedAt}` のみ）→ R8.3 と衝突     | **`[Constraint]` 🚨**      |
| **R4.2**         | 公開シェル面をトークン/primitive で彩色             | `PublicMemoPage/View` の生Tailwind                                                  | 中立トークン駆動化は backend 不変でも可能                                            | `[Extend]`                 |
| **R4.3**         | テーマ未紐付け時は中立フォールバック                | —                                                                                   | 実装容易（既定＝現行）                                                               | `[Extend]`                 |
| **R4.4**         | 編集=公開で本文スタイル同一                         | `createEditorExtensions` 共有済                                                     | 構造的に達成済。テーマ差だけが R4.1 に依存                                           | `[Extend]`                 |
| **R5**           | 三役タイポの確立と全域適用                          | 単一 `--shell-font`、游明朝/monospace 在庫                                          | `--shell-font-display/mono/body` 分割＋中立フォールバック（R5.5）                    | `[Extend]` `[New]`         |
| **R6**           | `.shell-eyebrow`/`.shell-chip`/番号付きセクション   | `primitives.css` の theme-neutral 構造                                              | 純粋な primitive 追加。トークン経由彩色                                              | `[New]`                    |
| **R7**           | AA コントラスト・ロールバック回避の継承             | `tokens.contrast.test.ts`・`mori.css.test.ts`・白床worst-case手法                   | 新規 surface/primitive へ検証を拡張。要素型セレクタ禁止の継続テスト                  | `[Extend]`                 |
| **R8.1-8.2,8.5** | 非森不変・外部JS追加ゼロ・非森バンドル不増          | Layer分割（mori.css は mori 時のみ fetch）、CSS変数のみ                             | 契約は既に整備済。逸脱しない運用                                                     | `[Constraint]`             |
| **R8.3**         | backend/DB スキーマ不変                             | —                                                                                   | **R4.1 と衝突**（下記§4.1）                                                          | **`[Constraint]` 🚨**      |
| **R8.4**         | G4/G5 非対象・受け皿は theme-neutral                | tokens.css の umi/yoru/asa placeholder                                              | 構造を theme-neutral に保つ（R6.5）                                                  | `[Constraint]`             |

---

## 4. Key Technical Gaps & Challenges（crux）

### 4.1 🚨 R4 公開ビュー vs R8.3 backend 不変 — 要件衝突

**事実**: `memo-sharing.service.ts` の公開取得は `select: { title: true, content: true, updatedAt: true }`。`PublicMemoResponseDto` も `{ title, content, updatedAt }` のみ。公開ページ（`PublicMemoPage`）はレイアウト外の独立ルートで、`data-theme` も `.theme-root` も `MoriEffectLayer`（生きた背景）も一切適用されない生 Tailwind。

**含意**: 「コンテンツに紐づくテーマの世界観で公開ビューを描画」（R4.1）を実現するには、公開レスポンスにテーマ識別子（slug or cssFilePath）を載せる**backend 変更が必須**。これは R8.3「backend/DB スキーマ不変」に抵触する（スキーマ追加は不要だが、公開 DTO の contract 拡張＋ `memo-public-isolation.invariants` の見直しが要る）。**backend を触らない限り R4.1 は達成不能。**

**設計フェーズで要る判断（いずれか）**:

- (a) R8.3 を微修正し「非機密なテーマ slug の公開レスポンス追加は許容」と再定義（DTO 拡張のみ・スキーマ不変は維持可）。最小 backend 変更。
- (b) R4 を「公開シェルの**中立**トークン駆動化＋本文ファクトリ共有」（R4.2/4.3/4.4）に留め、R4.1（コンテンツのテーマ適用）は**後続スペック**へ切り出す。backend 完全不変。
- (c) R4 全体を「公開没入」後続スペックへ委ね、本スペックは認証内ドメイン（memo/tag/notebook/settings/modal）に集中。

→ `[Research Needed]`: 公開レスポンスに theme slug を足すことの isolation invariant 影響と、プロダクト的に「公開＝送り主の世界ごと届ける」がどれだけ核心価値か（branding.md 的には核心＝(a) を後押し）。

### 4.2 R2.4 本文↔シェルの 2 系統ブリッジ（G4 非スコープ制約下）

メモ本文は `.theme-root .memo-content`（`--theme-*`）、周囲シェルは `.shell-*`（`--shell-*`）。両者が同一画面（`MemoEditor`）で隣接するため「境目で世界が断絶しない」には色・タイポ・余白の連続が要る。G4（一本化）は非対象なので**統合はせず、値を揃える／片方を他方に委譲する**設計判断が必要。
→ `[Research Needed]`: (i) `--theme-*` を `--shell-*` から算出（`--theme-text-color: var(--on-surface)` 等のブリッジ変数）にするか、(ii) 本文面も `.shell-*` タイポトークン（三役）を継承させるか。G2 の三役タイポ設計と密結合。

### 4.3 R3 スクリム/オーバーレイ primitive の新設

汎用スクリムトークン（`--scrim` / backdrop 濃度）が無い。生きた背景と調和しつつ前景パネルの可読性 AA を保つ濃度（R3.2/3.3）を、`tokens.css` に中立＋mori 値で追加し、`.shell-overlay`/`.shell-scrim` を `primitives.css` に足す。既存の開閉・フォーカストラップ挙動（R3.4）は className 追加のみで非破壊に。

### 4.4 G2 三役タイポの分割とフォールバック

`--shell-font` 単一 → `--shell-font-display`（游明朝）/`--shell-font-mono`（monospace）/`--shell-font-body`（可読地の文）へ分割。`.shell-title`/`.shell-subtitle` は display、ラベル・メタ・数値・日時・キー名は mono、本文は body へ割当（R5.2/5.3）。中立既定（`data-theme` 未設定）は三役ともシステムフォント基調へフォールバック（R5.5）＝実装前の見た目維持。既存 `.shell-*` の `font-family: var(--shell-font)` を役割別トークンへ置換する広域リファクタ。

### 4.5 R2.3 FOUC と非森バンドル不増の両立（先行契約の継承）

Layer①（tokens/primitives）は render-blocking で FOUC を防ぐ既存契約を、新ドメインでも維持する。森の重量リソース（Layer③ mori.css）は mori 有効時のみ fetch を厳守し、非森ユーザーの初期バンドルを増やさない（R8.5）。→ 新規 primitive・トークンは Layer① へ、重量テクスチャは Layer③ へ、の分業を崩さない。

---

## 5. Implementation Approach Options

### Option A: 先例踏襲・全面 Extend（玄関パターンの水平展開）

全ドメインを既存 `.shell-*` ＋ tokens で移行し、不足は tokens.css/primitives.css を拡張。R3/R4 も既存 primitive の範囲で吸収を試みる。

- ✅ 新ファイル最小・玄関の実績パターンと完全一致・学習コストゼロ
- ✅ 1 Todo=1 Commit のドメイン刻みに素直に乗る
- ❌ モーダル汎用 primitive・公開テーマ解決という**新しい住処が要る責務**を既存に無理押しし、`primitives.css` 肥大や一貫性崩れを招く
- ❌ R4 の backend 衝突は Extend では解けない（構造問題）

### Option B: 新規抽象を主軸（Overlay primitive・PublicThemeProvider を新設）

汎用 `ShellOverlay`/`ShellScrim` primitive、公開ページ用テーマ解決ラッパを新規コンポーネントとして作り、各ドメインはそれらを使う。

- ✅ R3/R4 の欠落責務にクリーンな住処。単体テスト容易
- ✅ 公開のテーマ適用を 1 箇所に集約でき再利用可能
- ❌ 大半（G1/G2/G3）は既存 primitive で足りるのに新規を増やすと過剰設計
- ❌ 玄関先例からの乖離＝一貫性リスク

### Option C: ハイブリッド（大半 Extend＋欠落責務のみ New）＝**推奨**

- **Extend**: G1 カバレッジ（≈25ファイル）・G2 三役タイポ・G3 構造装置は玄関パターンで tokens/primitives を拡張。
- **New**: R3 スクリム/overlay primitive（トークン＋`.shell-overlay`）と、R4 の公開テーマ解決（採択オプション次第で「中立トークン化のみ」か「theme 解決ラッパ」）だけ新設。
- **段階適用**: 要件指定の順（memo → tag → notebook → settings → public → modal）で刻み、**public/R4 の前に §4.1 の衝突を解決**しておく。

- ✅ 現実の資産分布に最も忠実（大半は住処あり、R3/R4 だけ無い）
- ✅ 玄関先例を保ちつつ欠落だけ最小新設
- ❌ 計画がやや複雑（衝突解決の前倒しが要る）

---

## 6. Effort & Risk

| 群   | 対象                        | Effort  | Risk       | 根拠（一言）                                       |
| ---- | --------------------------- | ------- | ---------- | -------------------------------------------------- |
| G1-a | memo/tag 移行（最量）       | **M**   | Low        | 玄関先例の機械的踏襲、ファイル数が多いだけ         |
| G1-b | notebook/settings 移行      | **S**   | Low        | 少数ファイル・既存トークンで足りる                 |
| R2.4 | 本文↔シェル ブリッジ        | **M**   | Medium     | 2系統名前空間の連続化は設計判断依存                |
| R3   | スクリム/overlay primitive  | **S–M** | Medium     | 新トークン＋少数の非破壊改修                       |
| R4   | 公開ビュー                  | **M–L** | **High**   | **backend 契約衝突**が未解決、テーマ適用を新規配線 |
| G2   | 三役タイポ                  | **S–M** | Low–Medium | 広域だが追加＋置換、素材在庫あり                   |
| G3   | 構造装置 primitive          | **S**   | Low        | 純粋追加、theme-neutral                            |
| R7   | コントラスト/契約テスト拡張 | **S**   | Low        | 既存テストハーネスを新面へ拡張                     |

**総合**: **L（1〜2週間）**。R4 を除けば **Medium**、R4 込みで **High**（backend 衝突が長い棒）。

---

## 7. Recommendations for Design Phase

### 7.1 推奨アプローチ

**Option C（ハイブリッド）** を採用し、**要件順にドメインを刻む**。ただし public/R4 に着手する前に §4.1 の要件衝突を決着させる。G1（memo→tag→notebook→settings）で世界を地続きにし、その間に R4 の方針を確定、最後に modal/overlay を被せる順が、リスクを後ろに寄せず段階的に確実。

### 7.2 設計フェーズで確定すべき鍵決定

1. **R4×R8.3 の衝突解消方針**（§4.1 の a/b/c）。プロダクト核心（branding: 「送り主の世界ごと届ける」）と backend 不変制約のトレードオフ。**最優先で人間承認が要る論点。**
2. **本文↔シェル ブリッジ方式**（§4.2）: `--theme-*` を `--shell-*` から算出するブリッジ変数を置くか、本文面を三役タイポトークンへ寄せるか。G2 設計と一体で決める。
3. **三役タイポのトークン語彙と割当規則**（§4.4）: display/mono/body の命名・各 `.shell-*` への割当・中立フォールバック機構。
4. **スクリムトークンの濃度設計**（§4.3）: 生きた背景の最明値が透けても前景 AA を割らない濃度を、白床 worst-case 手法（R7.2）で機械検証可能に。

### 7.3 設計フェーズへ持ち越す研究項目（Research Needed）

- **[R4 gating]** 公開レスポンスに theme slug を足す場合の `memo-public-isolation.invariants.spec.ts` への影響と、slug が非機密である確認。→ オプション(a) の可否を決定。
- **[R2.1]** settings/notebook 画面が `.app-shell`（半透明 surface＋透過床）配下にレンダリングされているか。配下でなければ没入連続の配線が別途要る。
- **[R4/公開没入]** 公開ページに `MoriEffectLayer`（生きた背景）を出すか、パレット＋テクスチャ止まりか。認証外・レイアウト外での effect 基盤マウント可否と 4 条件自動停止の適用。
- **[併走]** content-jsonb-migration（`contentSync.ts`/`prosemirrorText.ts`）が `.memo-content` の DOM 構造・クラスを変えないか。memo 編集ドメインの着手タイミングを migration と調整。
- **[R8.5]** 三役タイポ・構造装置・スクリムを全て Layer①（render-blocking）へ足した場合の Layer① サイズ増と、非森初期バンドルへの影響（重量テクスチャは Layer③ 厳守で回避）。

---

## 次のステップ

本ギャップ分析を踏まえ、`/kiro:spec-design immersive-world-full` で技術設計を作成する。設計では特に **§7.2-1（R4×R8.3 衝突）** をユーザー承認事項として最初に提示すること。

> **Note**: 本書はブラウンフィールド展開の設計を助けるための分析であり、最終的な実装選択は設計フェーズ（人間承認）で確定する。
