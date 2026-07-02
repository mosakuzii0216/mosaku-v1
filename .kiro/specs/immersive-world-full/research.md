# Research & Design Decisions — immersive-world-full

## Summary

- **Feature**: `immersive-world-full`
- **Discovery Scope**: Extension（先行スペック theme-immersive-world のシェル没入基盤をアプリ全域へ水平展開）
- **Key Findings**:
  - テーマ適用スタック（`.app-shell` + `.theme-root` + `data-theme` slug + `<ThemeEffectHost>` + `useThemeCSS`）は `DesktopLayout`/`MobileLayout` が**重複保有**。公開ページ（`/p/:token`）は**このレイアウト外**でテーマ適用ゼロ。→ スタックを共有コンポーネントへ抽出すれば玄関・モバイル・公開の 3 面が単一ソースで没入化できる。
  - メモのテーマは **`memo.notebook.theme` の単一経路**で解決される（Memo モデルに直 `themeId` は無く、`useActiveTheme` も `memo?.notebook?.theme` を見る）。公開没入に必要なのは notebook 経由テーマの slug + cssFilePath のみ。
  - `data-theme` slug は `getEffectKey(theme)`＝`theme.metadata.effectKey`（`VALID_EFFECT_KEYS` で検証、例 `'mori'`）由来。Layer③ CSS は `useThemeCSS` が `/themes/${cssFilePath}` を fetch。両者とも**非機密の静的アセット識別子**。
  - メモ本文面は旧 `.theme-root .memo-content`（`--theme-*` 変数、Layer③ `mori.css`）、周囲シェルは新 `.shell-*`（`--shell-*` トークン、Layer①）。2 系統は `mori.css` が両方を彩色して既に共存。R2.4 連続化は「本文の `--theme-*` を shell トークンへブリッジ」で G4 一本化に踏み込まず達成可能。

## Research Log

### 公開ビューのテーマ適用経路（R4 gating）

- **Context**: R4「コンテンツのテーマで公開ビューを描画」を backend 制約下で実現できるか。
- **Sources Consulted**: `memo-sharing.service.ts:147 findByToken`、`public-memo.controller.ts`、`types/memo.ts PublicMemoResponseDto`、`App.tsx:77 /p/:token`、`hooks/useActiveTheme.ts`、`hooks/useThemeCSS.ts`、`components/layouts/DesktopLayout.tsx:132-136`。
- **Findings**:
  - 公開取得は `select: { title, content, updatedAt }` のみ。DTO も同 3 フィールド。テーマ情報を一切返さない。
  - 公開ページは App 直下のルートで、`DesktopLayout` のテーマ適用（`data-theme`/`.theme-root`/`useThemeCSS`/`ThemeEffectHost`）を一切通らない。生 Tailwind のみ。
  - フロントの `useActiveTheme` はストア（notebook 選択・shell localStorage）依存で、公開の無認証・無ストア文脈では機能しない。テーマは API ペイロード由来で持ち込む必要がある。
- **Implications**: R4.1 は (1) backend 公開レスポンスへ非機密テーマ識別子（`cssFilePath` + `metadata.effectKey`）を追加、(2) レイアウトのテーマ適用スタックを共有化して公開でも同スタックを適用、の 2 点で実現。ユーザー承認済み（gap-analysis §4.1 option a）。

### 公開レスポンス拡張の安全性（isolation / schema ガード）

- **Context**: 公開 DTO へテーマ追加が既存の公開境界不変則を破らないか。
- **Sources Consulted**: `memo-public-isolation.invariants.spec.ts`、`memo-public-schema.spec.ts`、`public-read-observability.interceptor.ts`。
- **Findings**:
  - `memo-public-isolation.invariants.spec.ts` は**観測性の不変則**（Sentry 5 タグ契約・`feature_area=memo` 固定・サンプリング率・`@Throttle` 60req/分・helmet・`@Public()`+GET 限定）を守る。フィールド漏洩ガードではない。→ テーマ追加は feature_area/route を増やさないため**無影響**。
  - 公開レスポンスのフィールド形状は `memo-public-schema.spec.ts` が担保。テーマ追加時はここへ nullable な theme フィールドの assertion を足す。
  - 追加するのは `cssFilePath`（公開静的パス）と `metadata.effectKey`（slug）のみ。ユーザー id・userId・OAuth 等の機密は追加しない。
- **Implications**: backend 変更は「読み取り select の拡張＋型＋schema テスト」に限定。DB スキーマ・レート制限・観測性・認証境界は不変（R8.3 の微修正範囲内）。

### 三役タイポの現況と回帰リスク

- **Context**: G2 三役タイポ導入で mori/中立の既存見た目を回帰させないか。
- **Sources Consulted**: `themes/shell/tokens.css`（`--shell-font`）、`themes/shell/primitives.css`（`.shell-surface` 等の `font-family: var(--shell-font)`）、`mori.css`（`code` の monospace）。
- **Findings**:
  - 現行は単一 `--shell-font`（mori=游明朝 / 中立=システム）。`.shell-surface`/`.shell-field`/`.shell-button`/`.shell-title` 等が全て `var(--shell-font)` を参照。
  - mori の本文面は既に游明朝、コードは monospace。display/body の素材は在庫、mono も既存。
- **Implications**: 高価値・低リスクの核心は「**mono 役をラベル/データへ新規導入**」。display は既存の見出し游明朝を役割トークン化、body は現行値を維持して回帰ゼロ。`--shell-font` は body へのエイリアスとして残し既存参照を壊さない。

### モーダル/オーバーレイの汎用 primitive 不在

- **Context**: R3 のスクリム・パネル没入をどう供給するか。
- **Sources Consulted**: `ui/SyncToast.tsx`、`feedback/FeedbackModal.tsx`、`memo/FocusMemoOverlay.tsx`、`tag/TagDropdownIcon.tsx`、`tokens.css`。
- **Findings**: 汎用 Modal/Dialog primitive もスクリム（backdrop 濃度）トークンも未定義。各オーバーレイはベスポーク実装で開閉・フォーカストラップを自前保持。
- **Implications**: `--scrim`（中立 + mori 値）トークンと `.shell-scrim`/`.shell-overlay` primitive を追加。適用は className 追加のみで開閉・フォーカストラップ挙動を非破壊（R3.4）。

## Architecture Pattern Evaluation

| Option                      | Description                                                                | Strengths                                  | Risks / Limitations                                                        | Notes    |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- | -------- |
| A: 全面 Extend              | 既存 `.shell-*`+tokens で全域移行、R3/R4 も既存範囲で吸収                  | 新規最小・玄関先例一致                     | モーダル/公開テーマの住処が無く primitives 肥大・R4 backend 衝突は解けない | 却下     |
| B: 新規抽象主軸             | Overlay primitive・公開テーマ Provider を新設し各所が利用                  | R3/R4 にクリーンな住処                     | 大半（G1/G2/G3）は既存で足り過剰設計                                       | 部分採用 |
| **C: ハイブリッド（採用）** | 大半 Extend＋欠落（R3 scrim primitive・R4 公開テーマ共有スタック）のみ New | 資産分布に忠実・先例維持・欠落だけ最小新設 | 計画やや複雑（public 前に衝突解決が要る）                                  | **採用** |

## Design Decisions

### Decision: 公開没入は「backend 最小 slug 追加 ＋ テーマ適用スタック共有化」で実現

- **Context**: R4.1（公開をコンテンツのテーマで描画）と R8.3（backend 不変）の衝突。
- **Alternatives Considered**:
  1. slug 追加（backend 最小変更・DB スキーマ不変維持）→ R4.1 完全達成
  2. 公開は中立トークン化のみ・R4.1 は後続へ
  3. 公開まるごと後続スペックへ
- **Selected Approach**: (1)。`findByToken` の select に `notebook.theme` の `{ cssFilePath, metadata }` を足し、公開 DTO/型/`memo-public-schema.spec.ts` を拡張。フロントはレイアウトのテーマ適用スタックを共有コンポーネント `ImmersiveThemeRoot` へ抽出し、公開ページはペイロードのテーマを `ActiveTheme` 形へ写して同スタックを適用。
- **Rationale**: branding 核「送り主の世界ごと届ける」を honor。露出は非機密の公開アセット識別子のみで観測性・認証・レート制限の不変則に無影響。共有化で玄関/モバイル/公開のテーマ適用が単一ソース化。
- **Trade-offs**: backend に読み取り拡張が入る（R8.3 を「DB スキーマ不変＋公開読み取りへの非機密 slug 露出のみ許容」へ微修正済）。レイアウト抽出が Desktop/Mobile に触れる（既存 `shellImmersionRouting`/`NonDestructive` テストで非破壊担保）。
- **Follow-up**: `memo-public-schema.spec.ts` に nullable theme の assertion 追加。公開でのライブ背景（`ThemeEffectHost`）の是非を確認（無認証・軽量性）。

### Decision: 本文↔シェルは「`--theme-*` を shell トークンへブリッジ」で連続化（G4 非対象を維持）

- **Context**: R2.4 本文面（旧 `--theme-*`）と周囲シェル（新 `--shell-*`）の世界観連続。G4 一本化は非スコープ。
- **Alternatives Considered**:
  1. `mori.css` の `.theme-root` 内 `--theme-text-color` 等のハードコードを `var(--on-surface)`／`var(--accent)`／`var(--shell-font-display)` 等へ差し替え（薄いブリッジ層）
  2. 本文面も `.shell-*` タイポ/色トークンを直接継承（`.theme-root .memo-content` を shell トークン参照へ）
- **Selected Approach**: (1) を主、必要箇所で (2)。旧変数を shell トークン由来へブリッジし、shell トークン調整が本文へ伝播する構造にする。`.theme-root` セレクタ体系自体は温存（G4 非対象）。
- **Rationale**: 名前空間統合をせずに視覚連続を得る最小手。現行ハードコード値（`#e7f5ec`）は shell の `--on-surface`（`#e8f6ee`）とほぼ同値で回帰も最小。
- **Trade-offs**: 2 系統は当面併存（G4 で解消）。ブリッジ後は本文面のコントラストを再検証（R7.2 白床 worst-case）。
- **Follow-up**: `mori.css.test.ts` にブリッジ変数の期待値を追加。

### Decision: 三役タイポは mono 役の新規導入を核に、display/body は回帰ゼロで役割化

- **Context**: G2 全域適用で既存見た目を後退させない（R5.6 / R8.1）。
- **Selected Approach**: `--shell-font-display`（游明朝/中立=system）・`--shell-font-mono`（monospace）・`--shell-font-body`（現行 `--shell-font` 値を継承）を定義。`--shell-font` は `var(--shell-font-body)` エイリアスとして残す。見出し系 `.shell-*` は display、新 `.shell-label`/`.shell-data`（および `.shell-eyebrow`/`.shell-chip`）は mono、面の base は body。
- **Rationale**: 高価値（mono のデータ語彙）を取りつつ display/body の変化を最小化し回帰を避ける。既存 `var(--shell-font)` 参照を壊さない。
- **Trade-offs**: `--shell-font` の二重語彙が一時的に残る（将来 body へ寄せて整理可）。
- **Follow-up**: 中立フォールバック（`data-theme` 未設定）で三役とも system 基調になることをテストで固定（R5.5）。

## Risks & Mitigations

- **要素型セレクタ再発（ヘッダー文字消失の轍）** — primitives は `.shell-*` クラス選択子のみ・生リテラル禁止を継承。禁止セレクタの静的テストを新面へ拡張（R1.3 / 7.4）。
- **公開レスポンスの機密漏洩** — 露出は `cssFilePath` + `metadata.effectKey` に限定。`memo-public-schema.spec.ts` で形状固定、isolation invariant は無影響を確認。
- **レイアウト抽出の回帰** — `ImmersiveThemeRoot` 抽出は behavior-preserving。`shellImmersionRouting`/`NonDestructive`/`MobileLayout` テストで担保、差分は className/data 属性の同一性で検証。
- **非森バンドル増加（R8.5）** — 新 primitive/トークン/三役/scrim は Layer①（軽量 CSS）へ。重量テクスチャは Layer③（mori 時のみ fetch）厳守。公開でも mori 以外は Layer③ を fetch しない。
- **content-jsonb-migration 併走** — `.memo-content` の DOM/クラス安定に依存。memo ドメイン着手は migration の cutover と時期調整（`prosemirrorText.ts`/`contentSync.ts` の変更を確認してから）。

## References

- 先行スペック: `.kiro/specs/theme-immersive-world/{design,research,requirements}.md` — Layer 分割・FOUC・白床 worst-case コントラスト検証の確立元
- `frontend/src/themes/shell/{tokens,primitives}.css` — Layer① トークン契約・`.shell-*` primitive
- `frontend/public/themes/mori/mori.css` — Layer③ 森リッチパック＋旧 `.theme-root` 本文面
- `frontend/src/hooks/{useActiveTheme,useThemeCSS}.ts`・`frontend/src/types/theme.ts getEffectKey` — テーマ解決・CSS ロード・slug 導出
- `backend/src/memo/{memo-sharing.service,public-memo.controller}.ts`・`memo-public-schema.spec.ts` — 公開読み取り経路と形状ガード
