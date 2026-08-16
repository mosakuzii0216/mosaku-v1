# Research & Design Decisions

---

## Summary

- **Feature**: `memo-display-mode`
- **Discovery Scope**: Extension（既存システムへの拡張）
- **Key Findings**:
  - `useViewStore` が既存の UI 状態（ビューの切り替え・編集フラグ）を管理しており、表示モード状態も同ストアへの追加が自然
  - `PublicMemoRenderer` が TipTap `editable: false` のリードオンリーレンダラーとして既存実装済みで、そのまま再利用可能
  - テーマ CSS は `[data-theme-id]` セレクタでスコープ化されており、ポータルの div に同属性を付与することで継承できる

---

## Research Log

### テーマ CSS スコープと Portal の干渉

- **Context**: `FocusMemoOverlay` を `createPortal` で `document.body` に描画する場合、`DesktopLayout` の `[data-theme-id="..."]` スコープの外に出てしまいテーマ変数が継承されない可能性があった
- **Sources Consulted**: `frontend/src/hooks/useThemeCSS.ts`、`frontend/public/themes/mori/mori.css`
- **Findings**:
  - `useThemeCSS` は CSS テキストを `[data-theme-id="xxx"]` セレクタに置換して `<style>` タグを `document.head` に挿入する
  - ポータルラッパー div に `data-theme-id={activeTheme?.id}` を付与すれば同セレクタがマッチしてテーマ変数が適用される
- **Implications**: `FocusMemoOverlay` 内で `useActiveTheme()` を呼び出し、ラッパー div に `data-theme-id` を付与する設計を採用

### テーマエフェクトと表示モードの共存

- **Context**: `useMoriEffectControl` が `isEditorFocused` を停止条件に持つため、表示モード中にエディタフォーカスが外れるとエフェクトが停止するか懸念があった
- **Sources Consulted**: `frontend/src/hooks/useMoriEffectControl.ts`、`frontend/src/stores/useEditorFocusStore.ts`
- **Findings**:
  - `shouldRun = !isReducedMotion && !isEditorFocused && !isHidden && !isIdle`
  - `isEditorFocused = false`（表示モード中はエディタが非アクティブ）→ `!isEditorFocused = true` → shouldRun は他条件次第で `true`
  - 結論：表示モード中はエディタフォーカスが外れることでエフェクトが**停止するのではなく継続できる**状態になる
- **Implications**: `useMoriEffectControl` の変更不要。Req 5.3 の「エフェクトを継続表示」は現仕様のままで満たせる

### `useViewStore` vs 専用ストアの選択

- **Context**: 表示モード開閉状態をどのストアに持つかの検討
- **Sources Consulted**: `frontend/src/stores/useViewStore.ts`、`frontend/src/stores/useFeedbackStore.ts`
- **Findings**:
  - `useFeedbackStore` は `isOpen / open / close` のみを持つ単純なモーダル専用ストア（参考パターン）
  - `useViewStore` は `isMobile / currentObject / currentView / isEditing` などのグローバル UI 状態を保持
  - 表示モードはフルスクリーンオーバーレイであり、特定ビューへのナビゲーションではなくトランジェント UI 状態
- **Implications**: `useViewStore` に `isDisplayMode / openDisplayMode / closeDisplayMode` を追加する。専用ストアを作ると参照先が分散するため非採用

### PublicMemoRenderer の再利用性

- **Context**: リードオンリーコンテンツのレンダリングに新コンポーネントが必要かの確認
- **Sources Consulted**: `frontend/src/components/public/PublicMemoRenderer.tsx`
- **Findings**:
  - `PublicMemoRenderer` は `createEditorExtensions({ editable: false })` で TipTap インスタンスを生成し、`select-text` クラスでテキスト選択を有効化済み
  - `pointer-events: none` が適用されており誤編集防止も担保
  - 現在の `editorProps.attributes.class` に `prose` 系 Tailwind クラスが含まれるが、表示モード専用のスタイルは外側の CSS で上書き可能
- **Implications**: `PublicMemoRenderer` をそのまま再利用（Req 3.1, 3.2, 3.3 をカバー）

---

## Architecture Pattern Evaluation

| オプション               | 説明                                   | 強み                                                | リスク                                                               | 結論                         |
| ------------------------ | -------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| useViewStore 拡張        | 既存ストアに `isDisplayMode` を追加    | コードの一貫性、参照先が一箇所                      | ViewStore が肥大化する懸念                                           | **採用**（現状まだ許容範囲） |
| 専用 useDisplayModeStore | `useFeedbackStore` 同様の独立ストア    | 関心の分離が明確                                    | ストアが乱立し参照先が増える                                         | 非採用                       |
| Portal to body           | `createPortal(overlay, document.body)` | z-index 問題を根本回避、親 CSS transform の影響なし | テーマ CSS スコープ外になる（`data-theme-id` 付与で解決済み）        | **採用**                     |
| 通常 DOM マウント        | DesktopLayout 直下に条件レンダリング   | シンプル                                            | 親要素の `overflow:hidden` や CSS transform によるクリッピングリスク | 非採用                       |

---

## Design Decisions

### Decision: FocusMemoOverlay に useActiveTheme を直接呼ばせる

- **Context**: テーマ CSS 変数を Portal 内に継承させるため `activeTheme` が必要
- **Alternatives Considered**:
  1. `DesktopLayout` から `activeTheme` を prop で渡す
  2. `FocusMemoOverlay` 内で `useActiveTheme()` を呼ぶ
- **Selected Approach**: `useActiveTheme()` をコンポーネント内で直接呼ぶ
- **Rationale**: React Query のキャッシュから読むだけで追加 API コールは発生しない。props バケツリレーを増やすより自己完結性が高い
- **Trade-offs**: フック呼び出しが増えるが、コストは実質ゼロ（キャッシュ参照のみ）
- **Follow-up**: 将来的に `useViewStore` でテーマ ID を保持する設計変更があれば統合の余地あり

### Decision: ESC キーハンドリングは FocusMemoOverlay 内の useEffect で管理

- **Context**: ESC キーによる終了（Req 4.1）を実装する場所
- **Alternatives Considered**:
  1. `DesktopLayout` のグローバルキーハンドラに追加
  2. `FocusMemoOverlay` 内で `useEffect` により `keydown` を購読
- **Selected Approach**: `FocusMemoOverlay` 内の `useEffect` でハンドリング
- **Rationale**: 表示モードがマウントされているときだけイベントリスナーを登録・解除できる。cleanup が明確で副作用の漏れがない
- **Trade-offs**: `DesktopLayout` のキーハンドラとの競合を考慮が必要（`stopPropagation` で制御）
- **Follow-up**: 表示モード起動中に他のキーボードショートカットが誤発火しないことをテストで確認する

---

## Risks & Mitigations

- **z-index 競合**: Portal を `document.body` に描画するため z-index 管理が必要 → `z-50` 以上（`z-[9999]`）を割り当てる
- **テーマ CSS 非適用**: Portal 外で CSS 変数が届かない → ラッパー div に `data-theme-id` 付与で解決
- **スクロール ブロック**: 表示モード中はバックグラウンドのスクロールをロック → `body` に `overflow:hidden` を付与し、アンマウント時に解除
- **TipTap インスタンス多重化**: `PublicMemoRenderer` がエディタインスタンスを生成するためメモリ消費が増加する → 表示モードが閉じたときにアンマウントして破棄（条件レンダリング）

---

## References

- [TipTap `editable` option](https://tiptap.dev/docs/editor/core-concepts/editor#editable) — `editable: false` でリードオンリーレンダリング
- [React createPortal](https://react.dev/reference/react-dom/createPortal) — DOM ツリーの別箇所へのレンダリング
- `frontend/src/components/public/PublicMemoRenderer.tsx` — 既存リードオンリーレンダラー実装
- `frontend/src/stores/useViewStore.ts` — 拡張対象の UI 状態ストア
- `frontend/src/hooks/useMoriEffectControl.ts` — エフェクト停止条件のロジック
