# Implementation Plan

本プランは `mosaku-brand-theme` の実装タスクを Phase A（CSS + スコープ拡張）→ Phase B（JS エフェクト基盤）の順で分解したもの。各サブタスクは 1〜3 時間規模。`(P)` は同じ親タスク内で並列実行可能なタスクを示す。

## Phase A — CSS + テーマ適用スコープ拡張

- [x] 1. `mori` テーマ CSS の全面リライト
- [x] 1.1 深緑カラーパレットと CSS 変数の定義
  - `.theme-root` に深緑グラデ背景（ログイン画面 login-visual-redesign と同配色トーン）とベース文字色を設定する
  - 公開 CSS 変数（`--theme-bg` / `--theme-text-color` / `--theme-heading-color` / `--theme-accent-color` / `--theme-border-color` / `--theme-font-family` / `--theme-font-size` / `--theme-line-height` / `--theme-padding` / `--theme-margin` / `--theme-border-radius`）を森パレットで定義する
  - 既存の `.theme-root` スコープ規約を維持し、`useThemeCSS` のスコープ置換を前提としてセレクタを書く
  - 外部 `@import` / `url()` は使用しない
  - _Requirements: 1.1, 1.5, 4.4_
- [x] 1.2 `wave-pulse` 背景アニメーションの実装
  - 12 秒周期で深緑グラデが呼吸するように変化する `@keyframes wave-pulse` を `.theme-root` に適用する
  - 既存 `gradientShift` を 12 秒周期に調整する方針で単独の keyframes を定義する
  - _Requirements: 1.2_
- [x] 1.3 `fog-drift` 擬似要素レイヤーの実装
  - `.theme-root::before` と `.theme-root::after` の 2 層で白半透明の霧をゆっくり流す `@keyframes fog-drift` を定義する
  - 擬似要素はレイアウトに影響を与えず `pointer-events: none` を設定する
  - _Requirements: 1.3_
- [x] 1.4 サイドバー・ヘッダー・フォーム UI 色味の統一
  - `.theme-root .app-sidebar` / `.app-header` 系セレクタに森パレットを反映する
  - `input` / `textarea` / `button` / `a` / `.memo-title` / `.memo-content` 系のフォーム風 UI 要素の背景色・文字色・ボーダー色・フォーカスリング色を統一する
  - _Requirements: 1.4, 2.2_
- [x] 1.5 `prefers-reduced-motion: reduce` 対応
  - メディアクエリで `wave-pulse` / `fog-drift` など `mori` CSS 由来の全アニメーションを停止する
  - アニメ停止後も森パレット（背景グラデ・配色）を維持する別セレクタ定義を用意する
  - _Requirements: 4.1, 4.4_
- [x] 1.6 他テーマ非干渉の CSS レベル検証
  - `.theme-root` スコープを超えるセレクタや共通スタイルへの漏れがないことを静的レビューで確認する
  - 既存他テーマ（kami/aka/kuro/siro/ao/code）の CSS / 共通スタイルを変更していないことをリポジトリ diff で保証する
  - _Requirements: 3.1, 3.2_

- [ ] 2. アクティブテーマ解決フックの新設
  - 編集中メモのノートブック → 選択中ノートブック → null の優先順でアクティブテーマを決定するフックを追加する
  - 既存 `MemoEditor` のテーマ導出ロジックを本フックに移し替える前提でインターフェースを設計する
  - 同一レンダーサイクル内で安定した参照を返し、追加フェッチを発生させない
  - フック単体のユニットテスト（メモ選択 / ノートブック選択 / 未選択の 3 ケース）を追加する
  - _Requirements: 2.1, 2.4_

- [ ] 3. レイアウトへのテーマルート付与と CSS 注入
- [ ] 3.1 (P) デスクトップレイアウトのテーマルート適用
  - デスクトップ用レイアウトの最外殻にアクティブテーマから導出した `theme-root` クラスと `data-theme-id` を付与する
  - 同レイアウト内で `useThemeCSS` を呼び出し、サイドバー・ヘッダー・メモ本文が同じスコープに含まれるようにする
  - 既存の DOM 構造・コンポーネント階層を壊さず、テーマ切替時のちらつきが発生しないことを結合テストで確認する
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
- [ ] 3.2 (P) モバイルレイアウトのテーマルート適用
  - モバイル用レイアウトにも同等の `theme-root` / `data-theme-id` / `useThemeCSS` 連携を追加する
  - 既存 DOM 構造・コンポーネント階層を維持する
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
- [ ] 3.3 既存エディタのテーマ導出をアクティブテーマフックへ移行
  - メモエディタ・ノートブックエディタの `selectedNotebook?.theme || memo?.notebook?.theme` 相当の導出をアクティブテーマフックに置換する
  - 返却結果が従来ロジックと一致することをユニットテストで回帰検証する
  - _Requirements: 2.1, 2.4_

## Phase B — JS エフェクト基盤とパフォーマンス制御

- [ ] 4. テーマ型へのエフェクトメタデータ契約追加
  - `ThemeEffectKey` リテラルユニオン（初期値 `'mori'`）と `ThemeMetadata` 型を追加する
  - 既存 `Theme.metadata` を段階的に `ThemeMetadata` へ置換し、未知の `effectKey` は `undefined` として扱うフェイルセーフを保証する
  - 既存テーマ（kami/aka/kuro/siro/ao/code）のテーマ定義は一切変更しない
  - 新規 JS ライブラリを追加しない
  - _Requirements: 5.1, 5.4, 5.5_

- [ ] 5. エフェクトレジストリの新設
  - `effectKey → () => Promise<{ default: ComponentType }>` の静的マッピングモジュールを追加する
  - Vite の静的解析によるコード分割が成立するよう、import パスは文字列リテラルで固定する
  - `Record<ThemeEffectKey, ...>` で網羅検査を強制する
  - 未知 `effectKey` は `null` を返すフェイルセーフを実装する
  - ユニットテストで `'mori'` / `undefined` / 未知文字列の 3 ケースを網羅する
  - _Requirements: 3.4, 5.2, 6.1, 6.2, 6.3_

- [ ] 6. 既存エフェクト資産の共通配置への移動と `paused` 対応
- [ ] 6.1 (P) 森アニメーションレイヤーの移動と `paused` prop 追加
  - ログイン画面配下にある森アニメーションレイヤーを `effects` 共通ディレクトリへ移動する
  - `paused` prop を追加し、`true` の場合に各アニメーション style の `animationPlayState` を `paused` に切り替える
  - 既存 `disableAnimations` prop は維持する
  - ログイン画面側の import パスを新配置へ更新する
  - 既存テストに `paused` 挙動のケースを追加する
  - _Requirements: 6.1, 7.1, 7.2, 7.3, 7.4, 7.5_
- [ ] 6.2 (P) パーティクルキャンバスの移動と `paused` prop 追加
  - パーティクルキャンバスを `effects` 共通ディレクトリへ移動する
  - `paused` prop を追加し、RAF ループ内で描画だけをスキップするよう `pausedRef` で制御する
  - 既存の `pointer: coarse` / `disabled` / `reducedMotion` の判定を維持する
  - ログイン画面側の import パスを新配置へ更新する
  - 既存テストに `paused` 挙動のケースを追加する
  - _Requirements: 6.1, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 7. エディタフォーカス状態ストアの新設
  - `isEditorFocused: boolean` と `setEditorFocused(next)` のみを持つ Zustand ストアを追加する
  - 初期値は `false` とし、複数エディタ同時フォーカスは想定しない
  - ユニットテストで `setEditorFocused(true/false)` の前後でフラグが切り替わることを検証する
  - _Requirements: 7.1, 7.2_

- [ ] 8. 森エフェクト統合制御フックの新設
  - `prefers-reduced-motion` / エディタフォーカス / `visibilityState` / `mousemove` アイドル（3 秒）の 4 条件を並列に監視する
  - いずれかが真の場合に `shouldRun = false` を返すロジックを実装する
  - `mousemove` リスナーは `useRef` でデバウンスし、状態変化時のみ setter を呼ぶ
  - アンマウント時に全イベントリスナー・タイマーを解除するクリーンアップを実装する
  - ログイン画面由来の `useReducedMotion` を再利用する
  - Vitest + fake timer + `matchMedia` モックで各停止条件の遷移を網羅する
  - _Requirements: 4.2, 4.3, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 9. 森専用エフェクトレイヤーの新設
  - 森エフェクト統合制御フックで得た `shouldRun` を `paused={!shouldRun}` として森アニメーションレイヤーとパーティクルキャンバスに渡す
  - ルート要素に `fixed inset-0 pointer-events-none` 相当を設定し、メモ編集操作へ副作用を与えない
  - `pointer: coarse` デバイスではパーティクルキャンバス自体をマウントしない条件付きレンダーを実装する
  - アンマウント時に全 RAF・イベントリスナーが解除されることをユニットテストで検証する
  - フォーカス状態ストアを `true` にした後に `paused` が伝播することを統合テストで確認する
  - _Requirements: 3.3, 6.1, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 10. テーマエフェクトホストコンポーネントの新設
  - アクティブテーマから `effectKey` を抽出しレジストリ経由で `React.lazy` マウントする
  - `Suspense` fallback は `null` とし、内包する ErrorBoundary でロード失敗時に `null` にフォールバックする
  - `key={effectKey ?? 'none'}` 指定によりテーマ切替時に lazy コンポーネントを強制アンマウントする
  - `theme` が null もしくは `effectKey` 未設定時は何もレンダーせず RAF も起動しないことを保証する
  - ユニットテストで「mori → kami 切替時に子エフェクトがアンマウントされる」ことを検証する
  - _Requirements: 3.3, 5.2, 5.3, 6.1, 6.4_

- [ ] 11. レイアウトへのテーマエフェクトホストのマウント
  - デスクトップ／モバイルレイアウトの `<main>` 兄弟位置にテーマエフェクトホストを 1 回だけ配置する
  - アクティブテーマを props として渡し、非 mori 時は DOM に何も追加されないことを結合テストで検証する
  - _Requirements: 5.2, 6.1, 6.4_

- [ ] 12. エディタの TipTap フォーカス連携
  - メモエディタ・ノートブックエディタの TipTap 初期化で `onFocus` / `onBlur` ハンドラからフォーカス状態ストアを更新する
  - コンポーネントアンマウント時に `setEditorFocused(false)` を呼ぶクリーンアップを追加する
  - TipTap の onFocus/onBlur 経由で森エフェクト統合制御フックの `isEditorFocused` が追従することを結合テストで検証する
  - _Requirements: 7.1, 7.2_

- [ ] 13. `mori` テーマレコードへの `effectKey` メタデータ反映
  - 既存の `mori` テーマレコードの `metadata` に `{ "effectKey": "mori" }` を追加する seed 更新または管理手順を実装する
  - 旧クライアントは `effectKey` を無視して後方互換が保たれることを手動確認する
  - _Requirements: 5.1, 6.1_

- [ ] 14. 非 mori バンドル分離とパフォーマンス検証
- [ ] 14.1 コード分割成果物の検証
  - `npm run build` 成果物で `mori-effect-*.js` 相当の独立チャンクが生成されることを確認する
  - メインチャンクにエフェクトコードが含まれないことを grep 等で確認する
  - 非 mori テーマ選択時に当該チャンクがネットワーク層で読み込まれないことを結合テスト／手動検証で確認する
  - _Requirements: 3.4, 6.2, 6.3_
- [ ] 14.2 テーマ切替のライフサイクル整合性テスト
  - mori → 非 mori 切替で Canvas / 森要素が DOM から除去され、RAF が `cancelAnimationFrame` されることを結合テストで検証する
  - テーマ切替連打時にメモリリーク（Canvas / RAF 残存）がないことを手動プロファイルで確認する
  - _Requirements: 3.3, 6.4_
- [ ]\* 14.3 アクセシビリティ受け入れ基準の回帰テスト
  - `prefers-reduced-motion: reduce` 有効時に CSS アニメ・JS エフェクトの RAF が共に停止し、背景パレットが維持されることを結合テストで確認する
  - _Requirements: 4.1, 4.2, 4.4_

---

### 備考

- `(P)` マーク付きタスクは同じ親タスク内で他サブタスクと並列実行可能。
- `- [ ]*` マーク（14.3）は MVP 後にまわせる受け入れ基準ベースの補助テストカバレッジとして扱う。
- Phase A（タスク 1〜3）は Phase B に先行して単独リリース可能。Phase B（タスク 4〜14）は Phase A 完了後に着手する。
