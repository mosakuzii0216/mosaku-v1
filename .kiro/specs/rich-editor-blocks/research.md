# Research & Design Decisions — rich-editor-blocks

---

**Purpose**: design フェーズの判断根拠（TipTap 3.x パッケージ地図・セマンティックカラーの保存表現・公開ビュー開閉・AA 検証戦略）を記録する。結論は `design.md` に要約済み。本書は背景・トレードオフ・出典の一次記録。

**関連**: 現状調査の全量は `gap-analysis.md`（§1〜§6）に既出。本書はそれを前提に、design で決着すべき未知点（gap-analysis §6 Research Needed）の調査結果と決定を積む。

---

## Summary

- **Feature**: `rich-editor-blocks`
- **Discovery Scope**: Extension（既存 TipTap エディタへの4機能追加。DB 変更ゼロ・単一情報源への追加）
- **Key Findings**:
  1. **TipTap 3.22.2 で必要な公式拡張は全て調達可能**（table / text-style / highlight / details）。`@tiptap/extension-details-content` は stable 3.x に単独パッケージが無く（latest 2.26.2）、`@tiptap/extension-details` 本体に `DetailsSummary` / `DetailsContent` が同梱される。`@tiptap/pm` は既に `3.23.4` で deduped 済み。
  2. **Details の `persist:false`（既定）が G-1（公開ビューの `pointer-events-none` 衝突）を構造的に解消する。** persist=false なら開閉は NodeView の view-state のみで doc トランザクションを発行しないため、`editable:false` の公開ビューでも開閉が動く。DetailsContent は開閉に依らず常に doc content に存在するため Req7.4（閉トグルも検索）も同時充足。
  3. **公式 Color / Highlight は生 hex を保存する**（Req2.5 非準拠）。TextStyle / Highlight を `extend` してセマンティック名を data 属性へ保存し、CSS 変数で解決する方式で Req2.5/2.6 を構造的に満たす。
  4. **AA 機械検証インフラは `tokens.contrast.test.ts` に完成形。** 共有ユーティリティへ抽出し、editor セマンティックパレット×全テーマへ一般化すれば Req2.10 は新規発明なしで書ける。

---

## Research Log

### TipTap 3.22.2 パッケージ地図（gap-analysis G-5 の解消）

- **Context**: 4機能に必要な公式拡張が 3.22.2 で調達可能か、正確なパッケージ名・エクスポート・peer 依存を確定する（実装前の必須リサーチ）。
- **Sources Consulted**:
  - `npm view @tiptap/extension-{table,text-style,highlight,details,details-content}@3.22.2 version peerDependencies dependencies dist-tags`（レジストリ直接照会）
  - `npm ls @tiptap/core @tiptap/pm`（インストール実体の確認）
  - [TableKit extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/functionality/table-kit)
  - [TextStyleKit extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/functionality/text-style-kit)
  - [Details extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/nodes/details)
  - [Highlight extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/marks/highlight)
- **Findings**:
  - 4パッケージ全てに `3.22.2` が実在。peer は下表。
    | パッケージ | 3.22.2 | エクスポート | peerDependencies |
    | --- | --- | --- | --- |
    | `@tiptap/extension-table` | ✅ | `TableKit`, `Table`, `TableRow`, `TableHeader`, `TableCell` | `@tiptap/pm ^3.22.2`, `@tiptap/core ^3.22.2` |
    | `@tiptap/extension-text-style` | ✅ | `TextStyle`, `Color`, `BackgroundColor`, `TextStyleKit` ほか | `@tiptap/core ^3.22.2` |
    | `@tiptap/extension-highlight` | ✅ | `Highlight` | `@tiptap/core ^3.22.2` |
    | `@tiptap/extension-details` | ✅ | `Details`, `DetailsSummary`, `DetailsContent` | `@tiptap/pm ^3.22.2`, `@tiptap/core ^3.22.2`, **`@tiptap/extension-text-style ^3.22.2`** |
  - `@tiptap/extension-details-content@3.22.2` は **404**（stable latest 2.26.2＝v2 系のみ、3.x は `next` beta のみ）。→ 3.22.2 では details-content は単独パッケージでなく `@tiptap/extension-details` に同梱。DetailsSummary も同様。
  - `@tiptap/extension-details` latest dist-tag は **3.27.3**（Web 検索の「3.4.2」は誤読。全 3.x パッケージは 3.22.2→3.27.3 の統一版数系列）。
  - インストール実体: package.json は `3.22.2` 表記だが caret 解決で **`@tiptap/core@3.23.4` / `@tiptap/pm@3.23.4`** が hoist 済み（`npm ls` で deduped 確認）。新規パッケージ `3.22.2`（peer `^3.22.2`）は 3.23.4 で充足されるため互換。
  - Details の `persist` オプション: 既定 `false`。「開閉状態を document に保存するか」を制御。`openClassName` 既定 `is-open`。
  - Highlight/Color は色を hex で保存（`setHighlight({ color: '#ffcc00' })` / Color は `style="color:…"` inline）。`multicolor:true` で色を属性化。`extend()` による renderHTML/parseHTML/addAttributes 上書きは可能。
- **Implications**:
  - 追加依存は4本を **`3.22.2` にピン留め**（既存規約踏襲。core 3.23.4 と互換 dedupe）。`@tiptap/pm` は table/details の peer だが既に推移的に存在。table は `@tiptap/pm/tables` を内部利用するため **直接依存への昇格を推奨**（推移依存のままだと将来の hoist 変化で壊れうる）。
  - Details 採用は text-style を peer で要求 → 色機能（text-style 必須）と自然に相乗り。1パッケージ追加の重複なし。
  - details-content を個別 import しない（本体からエクスポートを取る）。

### Details の公開ビュー開閉と persist の選択（gap-analysis G-1 の解消）

- **Context**: `PublicMemoRenderer` は `pointer-events-none` で全操作を無効化しており（`PublicMemoRenderer.tsx:17`）、Req4.5（公開ビューでのトグル開閉）と正面衝突する。`editable:false` 下で開閉が成立する方式を確定する。
- **Sources Consulted**: Details 公式ドキュメント（persist / openClassName / read-only 挙動）、`PublicMemoRenderer.tsx`、`createEditorExtensions.ts`（`openOnClick:!editable`）。
- **Findings**:
  - `persist:false`（既定）では開閉は NodeView 内の view-state として保持され、doc へのトランザクションを発行しない。→ `editable:false` でも DOM 操作として開閉が成立し得る（コマンド発行不要）。
  - `persist:true` は開閉を node 属性へ書き込む → `editable:false` では書き込みトランザクションが弾かれ、公開ビュー開閉に「open 属性のみ許可するゲート」が別途必要。
  - DetailsContent は **開閉に依らず常に doc content に存在**（閉は CSS 非表示のみ）。→ persist 値に関係なく Req7.4（閉トグル本文の検索）・Req6.3/8.4（構造復元）を満たす。
  - `pointer-events-none` はリンククリック（`openOnClick:true` の公開ビュー意図）も殺している。
- **Implications**:
  - **persist=false を採用**し、`PublicMemoRenderer` から `pointer-events-none` を除去、編集不可は `editable:false` の責務に一本化する。これで (a) トグル開閉（view-state）、(b) リンク遷移（openOnClick）が公開ビューで動き、Req4.4「開閉を除く編集操作を受け付けない」は `editable:false` が構造的に保証する。
  - トレードオフ: 開閉状態は再読込で既定へリセット（doc に保存しない）。Req4/6/8 は開閉状態の永続を要求しないため許容。将来永続が必要になれば persist=true＋open 属性限定トランザクションゲートへ移行する（契約は design に明記）。

### セマンティックカラーの保存表現（gap-analysis G-2, Req2.5 の核）

- **Context**: Req2.5「生 hex/rgb を本文 JSON に保存しない・セマンティック識別子で保存」。公式 Color/Highlight は hex を保存するため非準拠。
- **Findings**:
  - 有力型: TextStyle / Highlight を `extend` し、attrs にセマンティック名のみ保持（例 `{ textColor: 'wakaba' }` / `{ marker: 'kiiro' }`）、`renderHTML` で `data-text-color="wakaba"` / `<mark data-marker="kiiro">` を出力、生 hex の `color`/`style` 属性は addAttributes で除去。
  - CSS 側で `[data-text-color='wakaba'] { color: var(--editor-text-wakaba, <既定>) }` と解決。`var()` 第2引数または `:root` 既定値が Req2.9 フォールバック＝公開ビュー中立パレット（Req6.5）を兼ねる。
  - 色/マーカーは text ノード上の mark → FE/BE 抽出器（content 再帰）が **無改修でテキストを抽出**（Req7.5 自動充足）。
- **Implications**: 拡張は「公式を extend した薄いセマンティックマーク」2種（textColor / marker）。生値の混入を防ぐため round-trip テストで JSON に hex が現れないことを固定する。

### AA 機械検証の一般化（Req2.7/2.8/2.10, gap-analysis G-3）

- **Context**: 4テーマ（mori 実装済み・umi/yoru/asa は memo 面 CSS 実在）× テキスト色/マーカー × 4色以上で全 AA を機械検証する。テーマ本文背景は多ストップ linear-gradient。
- **Findings**:
  - `tokens.contrast.test.ts` に WCAG 2.1 準拠の完成インフラ（`parseColor`/`compositeOver`/`relativeLuminance`/`contrastRatio`/`findBlock`/`extractVar`＋自己検証既知値）がテスト内インライン定義で存在。
  - テキスト色の背景はグラデ → 単色比較不可。既存テストの「両端合成（最明・最暗床）」戦略を「全ストップ or 両端」に一般化する。
  - マーカー/コールアウト背景を**不透明**にすれば「不透明背景×テキスト」の単純検証に落ちる。マーカーは {背景, 上のテキスト} を対の semantic トークンとして定義し、テーマ本文色に依存しない自己完結ペアで AA 検証する（Req2.8）。
- **Implications**: `contrast.ts` 共有ユーティリティへ抽出（既存 `tokens.contrast.test.ts` も import に切替え・重複排除）。新 `editorPalette.contrast.test.ts` が `:root` 中立＋各 `public/themes/*/*.css` を対象に全色 AA を検証。**色値そのものは AA テストが RED で炙り出して確定**（テスト先行で色を決める）。

### セマンティックパレットの CSS レイヤ配置

- **Context**: editor セマンティックカラー変数をどの CSS 層に置くか（shell tokens Layer① か memo 面 Layer③ か）。
- **Findings（gap-analysis §1.5 準拠）**:
  - shell `tokens.css`（Layer①・render-blocking）は `:root` 中立＋`[data-theme='mori']` のみ実装、umi/yoru/asa は placeholder。
  - `public/themes/{mori,umi,yoru,asa}/{name}.css`（Layer③・テーマ有効時 fetch）は **4テーマ全て実在**し、editor 本文は `.theme-root .memo-content` でここにテーマ化される。
  - 公開ビューは `data-theme` 属性を持たず、global `index.css`→tokens.css の `:root` を継承。
- **Implications**:
  - **中立既定パレット**（`:root { --editor-text-*, --editor-marker-*(-on), --editor-callout-* }`）を shell `tokens.css` `:root` に置く（常時ロード＝公開ビュー主経路＋Req2.9 フォールバック）。
  - **テーマ別上書き**を各 `public/themes/{name}/{name}.css` の `.theme-root` に置く（4テーマ全て実値・Req2.6/2.7/2.8）。umi/yoru/asa の shell placeholder 問題を回避できる（memo 面 CSS は4本とも実在するため）。
  - AA テストは (a) tokens.css `:root`、(b) 各 memo 面 CSS `.theme-root` を対象に反復。

### prose（Tailwind Typography）との共存

- **Context**: 編集面・公開ビューとも `prose` クラスが効く。新ノード（table/details/callout/mark）に prose 既定スタイルが干渉する。
- **Findings**: `prose` は `<table>` `<mark>` `<blockquote>` 等に既定スタイルを当てる。公開ビュー（`.prose`）と編集面（`.theme-root .memo-content` かつ prose）で描画一致（Req6.2）を保つには両スコープに同一の新ノード CSS を当てる必要がある。
- **Implications**: 新ノード CSS は編集面と公開面の両方に効くセレクタ（例 `.memo-content` と公開の `.prose` 双方、または共通の `[data-callout]` / `.tiptap` 起点）で定義し、`saveRoundTrip` 系のスナップショットで構造一致を固定する。

---

## Architecture Pattern Evaluation

| Option                                              | 説明                                                             | Strengths                                                      | Risks / Limitations                                   | 採否     |
| --------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| A: 公式拡張最大活用＋コールアウトのみ自作（Hybrid） | table/color/marker/toggle は公式 extend、callout はカスタム node | スキーマ・キーボード操作・Tab 移動を公式に委譲。品質リスク最小 | 3.x パッケージ地図の確認要（解消済み）                | **採用** |
| B: 全て自作カスタムノード                           | 依存ゼロ・完全制御                                               | —                                                              | 表のセル選択/行列操作の再発明は工数爆発・品質リスク大 | 却下     |

- 詳細な軸比較（軸1〜4）は `gap-analysis.md §4` を参照。design は軸1=A / 軸2=A（セマンティック名保存）/ 軸3=A（バブルメニュー＋スラッシュパレット）/ 軸4=機能別（callout・toggle は NodeView、color/marker は mark＋外部 UI）を採用。

## Design Decisions

### Decision: TipTap 公式拡張を 3.22.2 で調達し単一情報源へ追加

- **Alternatives**: (A) 公式 Hybrid / (B) 全自作。
- **Selected**: A。`@tiptap/extension-{table,text-style,highlight,details}@3.22.2` を追加し `createEditorExtensions.ts` に登録。`@tiptap/pm` を直接依存へ昇格。
- **Rationale**: 表のセル操作・Tab 移動・details のアクセシビリティを公式に委譲。単一情報源経由で往復一致を構造担保（Req6.1）。
- **Trade-offs**: 4依存追加。ただし DB 変更ゼロ・バンドル影響は編集/公開画面に限定。

### Decision: セマンティックマーク（textColor / marker）で hex 非保存

- **Selected**: TextStyle / Highlight を extend し attrs にセマンティック名のみ保存、data 属性＋CSS 変数で色解決。公式 Color/BackgroundColor サブ拡張は登録しない。
- **Rationale**: Req2.5/2.6 を構造充足。CSS 変数名変更が本文データへ波及しない。抽出器が mark 越しにテキストを自動抽出（Req7.5）。
- **Follow-up**: JSON に hex が出現しないことを round-trip テストで固定。

### Decision: Details は persist=false＋`pointer-events-none` 除去

- **Selected**: `Details.configure({ persist:false })`。公開ビューは `editable:false` のみで編集不可を担保し、`pointer-events-none` を除去。
- **Rationale**: 開閉が view-state で完結し公開ビュー開閉（Req4.5）が動く。DetailsContent は常に doc content に在り Req7.4/6.3/8.4 充足。リンク遷移も回復。
- **Trade-offs**: 開閉状態は再読込でリセット（要件は永続を要求せず許容）。
- **Follow-up**: 永続が必要化した場合は persist=true＋「open 属性限定トランザクションゲート」へ移行（契約は design に記載）。

### Decision: セマンティックパレットの2層配置＋AA 機械検証の共有化

- **Selected**: 中立既定を shell `tokens.css` `:root`、テーマ別を `public/themes/*/*.css` `.theme-root`。`contrast.ts` を共有抽出し全テーマ×全色を AA 検証。
- **Rationale**: 公開ビュー中立（Req6.5）とフォールバック（Req2.9）を `:root` 一箇所で兼ねる。memo 面 CSS は4テーマ実在のため umi/yoru/asa も実値で AA 検証可能（Req2.10）。
- **Follow-up**: テキスト色はグラデ背景の両端合成、マーカー/コールアウトは不透明背景で検証を単純化。色値は AA テスト RED で確定。

### Decision: 色 UI はバブルメニュー（選択適用）＋スラッシュパレット（以降入力）

- **Selected**: 選択範囲への適用（Req2.1/2.2）はバブルメニュー、以降の入力への適用（Req5.3）はスラッシュの第3モード `palette`。表の行列操作（Req3.3）・コールアウト種別変更（Req1.3）もバブルメニュー基盤に相乗り。
- **Rationale**: スラッシュ単独では選択範囲へ適用不可（キャレット発動のため）。既存 notebook サブメニューの先例で palette モードを同型実装できる。
- **Trade-offs**: バブルメニューは本プロジェクト初 UI。`@tiptap/react` のメニュー機構（既存依存）で実装。

## Risks & Mitigations

- **R1 コールアウトのキャレット閉じ込め（Req1.5）** — StarterKit 同梱 Gapcursor＋文末脱出 keymap（ArrowDown/Mod-Enter）を契約化。手動＋ユニットで脱出を固定。
- **R2 Details の editable:false 開閉が実機で動くか** — persist=false 前提だが公式が read-only 挙動を明記せず。実装タスクで最優先検証。動かない場合の待避＝公開ビュー専用の CSS/native `<details>` 描画（契約は design に代替として記載）。
  - **spike 結果（Task 1.2）**: persist:false 方式で成立を確定。実 Editor でトグルボタンをクリックし、`editable:false` 下でも view-state（CSS class 付け外し・`hidden` 属性）のみで開閉し doc トランザクションを発行しないことを確認（`detailsPublicToggle.spike.test.ts`）。待避契約（persist:true + ゲート）は不要。
  - **副次発見**: StarterKit 標準 `TrailingNode`（doc 末尾が非デフォルト型ノードのときトランザクションのたびに空段落を自動挿入する編集 UX 補助）は `editable` を判定しない。Details の persist:false クリックハンドラは内部で無条件に `editor.commands.focus()` を呼ぶため、`details` が doc 末尾にあると公開ビューでもトグルクリックだけで doc 構造が変わってしまう（Req6.4 違反）。読み取り専用ビューにこの UX は不要なため `createEditorExtensions.ts` で `trailingNode: editable ? undefined : false` として editable:false 時のみ無効化して解消。この対処は editable 非依存に閉じるため、後続タスクで table/callout 等の新ノードが doc 末尾に来ても再発しない。
- **R3 グラデ背景上の AA 破綻** — テキスト色は両端合成検証、マーカー/コールアウトは不透明背景。色値はテスト RED で炙り出し。破綻色は palette から除外。
- **R4 prose 干渉で編集/公開の描画差** — 両スコープに同一 CSS＋スナップショット往復テストで差異を検出。
- **R5 mark 共存（色＋マーカー＋既存装飾）の JSON 破綻** — 複数 mark 同時適用の round-trip テストを追加。
- **R6 `@tiptap/pm` の推移依存切れ** — 直接依存へ昇格して固定。
  - **実装時の追補（Task 1.1）**: `@tiptap/core` の peerDependency は `@tiptap/pm` の厳密同一バージョンを要求するため（caret ではない）、`@tiptap/pm` を額面どおり `3.22.2` にピン留めすると cold resolve で `@tiptap/core` が最新 `3.27.3` へ動いて ERESOLVE 衝突する。実際にツリー全体がデデュープする `3.23.4` へ `@tiptap/pm` をピン留めし、`overrides`（root・frontend 両 `package.json`）で `@tiptap/core`/`@tiptap/pm` を `3.23.4` に強制固定して解消した。

## References

- [TableKit extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/functionality/table-kit) — TableKit の同梱内容・configure
- [Table extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/nodes/table) — tableWrapper 横スクロール・Tab 移動
- [TextStyleKit extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/functionality/text-style-kit) — TextStyle/Color の内包関係
- [Details extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/nodes/details) — persist / openClassName / DetailsSummary・DetailsContent
- [Highlight extension | Tiptap Docs](https://tiptap.dev/docs/editor/extensions/marks/highlight) — multicolor / setHighlight / extend 可否
- リポジトリ内: `gap-analysis.md`（現状調査全量）, `tokens.contrast.test.ts`（AA 検証インフラ）, `createEditorExtensions.ts`（単一情報源）, `slashCommandItems.ts` / `suggestion.ts`（サブメニュー先例）, `prosemirrorText.ts` / `prosemirror-text.ts`（content 再帰抽出）
