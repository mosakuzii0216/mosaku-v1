# Research & Design Decisions — mosaku-brand-theme

---

## Summary

- **Feature**: `mosaku-brand-theme`
- **Discovery Scope**: Extension + Complex Integration（既存テーマシステム + 既存 login-visual-redesign 資産の統合）
- **Key Findings**:
  - 既存 `useThemeCSS` が `.theme-root` → `[data-theme-id="xxx"]` へ実行時スコープ置換を行っており、`mori.css` 内のセレクタは自動的に mori テーマ選択時のみ適用される。Phase A のスコープ拡張は「どの DOM 要素に `theme-root` を付けるか」の決定に集約できる。
  - `login-visual-redesign` で `ForestAnimationLayer` / `ParticleCanvas` / `useReducedMotion` / `wave-pulse` / `fog-drift` / `leaf-float` の CSS keyframes が既に実装済みで、Phase B で再利用すれば新規 JS ライブラリは不要。
  - TipTap 編集フォーカスと森エフェクトの RAF は DOM 的に疎結合のため、グローバルな「エディタフォーカス状態」を Zustand で一元管理し、エフェクトレイヤー側で subscribe する構造が最も単純。

## Research Log

### R1: 現状の `.theme-root` 適用スコープ

- **Context**: Phase A でサイドバー・ヘッダーを含むアプリ全体に森テーマを拡張するために、現状の適用方式を把握する必要があった。
- **Sources Consulted**:
  - `frontend/src/components/memo/MemoEditor.tsx:197`
  - `frontend/src/components/notebook/NotebookEditor.tsx:163`
  - `frontend/src/hooks/useThemeCSS.ts`
  - `frontend/src/utils/themeLoader.ts`
- **Findings**:
  - `.theme-root` は `MemoEditor` と `NotebookEditor` のルート div にのみ付与され、`selectedTheme?.id` を `data-theme-id` 属性として受け取る。
  - `useThemeCSS` は `/themes/{cssFilePath}` を fetch し、CSS 文字列中の `.theme-root` を `[data-theme-id="{id}"]` に正規表現置換したうえで `<style data-theme-loader="{id}">` として `<head>` に注入する。
  - 結果として、mori.css の全セレクタは「この id を `data-theme-id` に持つ要素の配下」にのみ適用される。他テーマを選んでいる限りスタイルは DOM に影響しない。
- **Implications**:
  - Phase A での「アプリ全体への拡張」は、レイアウトルート（`DesktopLayout` / `MobileLayout`）にも `.theme-root` + `data-theme-id` を付与するだけで実現でき、CSS 置換ロジックを変更する必要はない。
  - サイドバー・ヘッダー側のスタイル変数化は、mori.css にそれらの領域向けセレクタを追記すれば済む（既存の `.memo-title` と同じパターン）。

### R2: 現在アクティブなテーマの決定ロジック

- **Context**: レイアウトルートにどのテーマを適用するかが要件上明示されていないため、既存のテーマ適用モデルと整合する決定関数を設計する必要があった。
- **Sources Consulted**:
  - `frontend/src/components/memo/MemoEditor.tsx:41`（`selectedNotebook?.theme || memo?.notebook?.theme`）
  - `.kiro/steering/product.md`（テーマは「ユーザーが自由に切り替え・お気に入り登録」）
- **Findings**:
  - 現状のテーマは「開いているメモ/ノートブック」に紐づいており、ユーザー単位のアクティブテーマという概念は未導入。
  - 既存ストア `useMemoDataStore` に `selectedNotebookId` が存在し、ノートブック情報は React Query キャッシュから解決できる。
- **Implications**:
  - Phase A のスコープではユーザープロファイルにアクティブテーマを追加せず、「現在選択中のノートブックまたはメモに紐づくテーマ」を _アプリ全体のアクティブテーマ_ として昇格させる方針を採る。要件 2.1（ログイン後にレイアウトルートに `.theme-root` を付与する）は「選択があれば付与、なければ付与しない」と解釈して充足する。
  - ユーザープロファイルテーマへの将来拡張に備え、解決ロジックは `useActiveTheme` フックに閉じ込めて差し替え可能にする。

### R3: Theme 型への JS エフェクト宣言方式

- **Context**: 要件 5.1 で `Theme` 型に JS エフェクトコンポーネントを宣言する必要があるが、Theme 情報はバックエンドから JSON で配信されるため関数参照を直接持てない。
- **Sources Consulted**:
  - `frontend/src/types/theme.ts`（既存 `metadata?: Record<string, any>` フィールド）
  - Vite 公式ドキュメント（動的 import によるコード分割）
- **Findings**:
  - `Theme.metadata` は既に任意 JSON を受け取る汎用フィールドとして存在する。
  - Vite は `import('./path')` 形式の静的文字列動的 import をバンドル時に別チャンクへ分離できるが、変数による動的 import はコード分割しない。
  - したがって effect の解決はフロントエンド側の静的レジストリ（キー → `() => import('...')` 関数）に集約する必要がある。
- **Implications**:
  - Theme 型には `metadata.effectKey?: ThemeEffectKey` を規約として追加し、`ThemeEffectKey` をリテラル union（初期値 `'mori'`）として宣言する。DB には文字列のみ保存し、関数解決はフロントエンドのレジストリが担当する。
  - この分離によって要件 5.4（他テーマ定義の不変更）は「mori 以外のテーマは effectKey を持たないまま」で満たせる。

### R4: 編集中の自動停止（エディタフォーカス連携）

- **Context**: 要件 7.1/7.2 で TipTap の `onFocus` / `onBlur` に合わせて森エフェクトの RAF を停止／再開する必要がある。
- **Sources Consulted**:
  - `frontend/src/components/auth/ForestAnimationLayer.tsx`
  - `frontend/src/components/auth/ParticleCanvas.tsx`
- **Findings**:
  - TipTap エディタは `MemoEditor` / `NotebookEditor` 内部に閉じており、エフェクトレイヤー（レイアウト側）と DOM ツリー上は兄弟関係にある。
  - 既存 `ForestAnimationLayer` / `ParticleCanvas` は `isDisabled` 値の変化で `useEffect` を再実行して RAF をキャンセル/再起動する方式だが、「頻繁なフォーカス on/off で DOM ごとアンマウントする」のはちらつきの原因となる。
- **Implications**:
  - エディタフォーカスはグローバル状態としてのみ意味があるため、`useEditorFocusStore` を新設し、TipTap 初期化時の `onFocus` / `onBlur` で `setEditorFocused(true/false)` を呼ぶ。
  - エフェクトレイヤー側は `paused` prop を受け取り、内部で `ref` 経由で RAF ループ内の early return に使う方式とする。マウントを維持したまま描画だけを停止する。

### R5: 外部依存ライブラリ調査

- **Context**: 要件「外部 JS ライブラリ追加ゼロ」を確実に満たすため、追加候補ライブラリが不要であることを確認した。
- **Sources Consulted**:
  - 既存 `frontend/package.json` の依存関係
  - login-visual-redesign 実装資産
- **Findings**:
  - 森エフェクトは `ForestAnimationLayer`（DOM + CSS keyframes）と `ParticleCanvas`（Canvas 2D API）だけで構成されており、React と既存フックのみで実装可能。
  - `matchMedia`、`requestAnimationFrame`、`cancelAnimationFrame`、`document.visibilityState` はすべて標準 Web API。
- **Implications**:
  - 新規依存追加ゼロで要件 5.5 / 3.4 を充足。バンドルサイズ増分は mori 選択ユーザーの動的チャンクのみ。

## Architecture Pattern Evaluation

| Option                                                 | Description                                                                                                                                  | Strengths                                         | Risks / Limitations                                                   | Notes |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- | ----- |
| A: Theme CSS 直付け + テーマ別専用コンポーネント       | `mori` 専用コンポーネントをレイアウトに常時 import し、テーマ ID が `mori` の時だけ表示                                                      | 単純・既存知識で実装可                            | 他テーマユーザーのバンドルにも含まれ、要件 3.4 / 6.3 に違反           | 却下  |
| B: テーマエフェクト基盤 + 静的レジストリ + 動的 import | `ThemeEffectHost` がテーマのメタデータから effectKey を読み取り、レジストリ経由で `React.lazy` コンポーネントを解決し、`Suspense` でマウント | 要件 5/6 をすべて満たす。将来テーマでも再利用可能 | 初回ロード時の描画遅延 → Suspense fallback を `null` にして透明にする | 採用  |
| C: Micro Frontend（テーマ単位の独立バンドル）          | テーマ自体を独立したパッケージとしてロード                                                                                                   | 極端な分離が可能                                  | 実装コストが大きすぎ、単一リポジトリのモノレポ構成と不整合            | 却下  |

## Design Decisions

### Decision: アクティブテーマの決定を `useActiveTheme` フックに集約する

- **Context**: レイアウトルート / 編集エリアの双方に同じテーマを適用する必要があり、将来はユーザープロファイルの設定にも対応したい。
- **Alternatives Considered**:
  1. レイアウトが直接 `useMemoDataStore` と React Query を触る — 複数箇所で重複ロジックが発生する。
  2. `useActiveTheme` フックに決定ロジックを閉じ込める — 呼び出し側はテーマオブジェクトだけ受け取る。
- **Selected Approach**: Option 2。解決順序は `(1) 編集中メモのノートブックテーマ → (2) 選択中ノートブックのテーマ → (3) null`。
- **Rationale**: 既存 `MemoEditor.tsx:41` のロジックを中央集約するだけで既存挙動と互換、将来の「ユーザープロファイルのデフォルトテーマ」を (3) の fallback として追加できる。
- **Trade-offs**: レイアウトとエディタで同じフックを二重呼び出しするが、React Query によってクエリは dedup される。
- **Follow-up**: Phase A 実装時に `MemoEditor` / `NotebookEditor` 側の既存 `selectedTheme` 算出を `useActiveTheme` に切り替えて回帰が無いことを確認する。

### Decision: `ThemeEffectHost` + 静的レジストリ方式で JS エフェクトをマウント

- **Context**: 要件 5 / 6 で「テーマ型に JS エフェクト宣言」「mori 選択時のみ動的 import」を同時に満たす必要がある。
- **Alternatives Considered**:
  1. Theme 型に直接関数参照を持たせる — バックエンド JSON で配信できないため不採用。
  2. `metadata.effectKey` 文字列 + フロント側レジストリ — Vite の静的 import 解析とコード分割を活用できる。
- **Selected Approach**: Option 2。`themeEffectRegistry: Record<ThemeEffectKey, () => Promise<{ default: React.ComponentType }>>` をフロントに定義し、`ThemeEffectHost` が `React.lazy` でラップしてマウントする。
- **Rationale**: DB スキーマ変更は不要（metadata JSON に `effectKey` を足すだけ）、Vite は静的 `import('./effects/mori/MoriEffectLayer')` を別チャンクへ分離する。非 mori ユーザーはチャンクをダウンロードしない。
- **Trade-offs**: 初回 mori 適用時に Suspense fallback が 1 フレーム入り得るが、fallback を `null`（透明）にすれば視覚的に目立たない。
- **Follow-up**: Vite のビルドログでチャンク分離を確認。`mori-effect-*.js` 相当が生成されていることを `npm run build` の成果物で検証する。

### Decision: エディタフォーカスは Zustand のグローバルストアで一元管理

- **Context**: 要件 7.1/7.2 の実現に、TipTap とエフェクトレイヤー間の通信経路が必要。
- **Alternatives Considered**:
  1. カスタムイベント `window.dispatchEvent('editorFocus')` — React 状態と乖離しテスト困難。
  2. React Context — Provider 追加でレイアウト階層が複雑化。
  3. Zustand ストア `useEditorFocusStore` — 既存のストア運用パターンと一致。
- **Selected Approach**: Option 3。ストアは `isEditorFocused: boolean` と `setEditorFocused(next: boolean)` のみを公開する。
- **Rationale**: `structure.md` で定義された「Zustand は UI 状態管理専用」の方針に合致。TipTap の onFocus/onBlur から直接 setter を呼べ、エフェクト側は selector で subscribe。
- **Trade-offs**: 同一ページに複数エディタがマウントされるケースはカウンタ管理が必要だが、現状 MemoEditor / NotebookEditor は排他的に表示されるため `boolean` で十分。
- **Follow-up**: 将来複数エディタ並置が必要になればカウンタへ差し替え。

### Decision: ForestAnimationLayer / ParticleCanvas に `paused` 入力を追加（DOM 維持）

- **Context**: 既存コンポーネントはマウント時に RAF を開始し、アンマウント時に `cancelAnimationFrame` を呼ぶ実装で、頻繁な pause/resume には向かない。
- **Alternatives Considered**:
  1. エフェクトホスト側でマウント/アンマウントを切り替える — ちらつき、状態喪失、Canvas 再初期化コスト。
  2. `paused` prop を追加し、ref 経由で RAF ループ内で早期 return する — DOM とコンポーネント状態を保持したまま描画だけ停止。
- **Selected Approach**: Option 2。`ForestAnimationLayer` と `ParticleCanvas` に `paused?: boolean` を追加し、ループ内の `if (pausedRef.current) { rafIdRef.current = requestAnimationFrame(drawLoop); return; }` で描画を skip する（ParticleCanvas）。`ForestAnimationLayer` は CSS アニメーションのため `animationPlayState` を `paused|running` で切り替える。
- **Rationale**: login-visual-redesign の既存 API を破壊せずに prop を追加するだけで済み、回帰リスクが最小。CSS アニメーションの `animationPlayState` 切替は再生オフセットを保持するため復帰時の見た目が自然。
- **Trade-offs**: `paused` 中も RAF は 1 フレームごとに呼ばれ続けるので、より厳密に CPU を抑えたい場合は完全停止方式が優る。今回は復帰コスト < CPU 微損と判断。
- **Follow-up**: 停止中の CPU プロファイルを Chrome DevTools で確認し、有意な消費がないか計測する。

### Decision: 既存 `ForestAnimationLayer` / `ParticleCanvas` を `components/effects/` へ移動

- **Context**: これらは現在 `components/auth/` 配下にあり、login 画面専用の名前空間になっているが、mosaku-brand-theme では認証以外でも使用する。
- **Alternatives Considered**:
  1. `components/auth/` に残したまま新ホストから参照 — ドメイン境界が曖昧になる。
  2. `components/effects/` へ移動 — 命名と責務の一致。
- **Selected Approach**: Option 2。併せて既存 auth 側の import を新パスへ更新、テストファイルも同時移動する。
- **Rationale**: `structure.md` の「ドメイン別ディレクトリ」原則に沿う。login と mosaku-brand-theme の両方が `components/effects/` から共通コンポーネントを参照する形が最も明示的。
- **Trade-offs**: Git 履歴追跡のため rename コミットを明示的に分ける必要があるが、影響範囲はテスト含めても数ファイル。
- **Follow-up**: 移動後に `npm run lint` と `npm run build` で import エラーゼロを確認。

## Risks & Mitigations

- **R-1: レイアウトに `.theme-root` を付けたことでサイドバー/ヘッダーの既存スタイル（Tailwind）と競合する** — mori.css 側では `background: ...` を直接指定せず CSS 変数とフォールバックのみを定義し、既存 Tailwind クラスは残す。セレクタ特異性も極力プレーンに保つ。
- **R-2: テーマ切替時にレイアウトが再マウントされて Canvas が flicker する** — `ThemeEffectHost` を `key={effectKey ?? 'none'}` 単位で切り替え、同一テーマ内では再マウントしない。テーマ遷移時の一瞬の Suspense fallback は `null` にする。
- **R-3: TipTap の `onBlur` が editor インスタンス破棄時に呼ばれず、フォーカスフラグが `true` に張り付く** — MemoEditor / NotebookEditor の `useEffect` クリーンアップで確実に `setEditorFocused(false)` を呼ぶ保険を入れる。
- **R-4: `prefers-reduced-motion` 有効時でも背景グラデーションの色味は維持する必要がある（要件 4.4）** — `mori.css` 側の reduce クエリでは `animation-name: none` を適用するだけで背景色定義は維持するようにセレクタを分離する。
- **R-5: `ParticleCanvas` の pointer: coarse 判定が起動時に固定される（既存実装）** — 要件 7.6 は起動時判定で十分（タッチ/マウス混在デバイスは Phase B スコープ外）。

## References

- `frontend/src/components/auth/ForestAnimationLayer.tsx` — 既存アニメーション実装（再利用対象）
- `frontend/src/components/auth/ParticleCanvas.tsx` — 既存パーティクル実装（再利用対象）
- `frontend/src/hooks/useReducedMotion.ts` — OS 設定検出フック
- `frontend/src/hooks/useThemeCSS.ts` — CSS スコープ置換ロジック
- `.kiro/steering/20260408-login-visual-redesign/brainstorm.md` — 森デザイン思想の根拠
- [Vite Docs — Dynamic Import Chunking](https://vitejs.dev/guide/features.html#dynamic-import) — 動的 import によるコード分割仕様
