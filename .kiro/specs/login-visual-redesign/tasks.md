# Implementation Plan

## タスク概要

- **合計**: 7 major tasks、16 sub-tasks
- **並列実行**: Task 1 完了後、Tasks 2〜5 は並列実行可能
- **推定**: 各 sub-task 1〜3時間

---

- [x] 1. prefers-reduced-motion 検出フックの作成
- [x] 1.1 `useReducedMotion` フックを実装する
  - `window.matchMedia('(prefers-reduced-motion: reduce)')` を読み取り、OS設定をリアクティブに返すカスタムフックを作成する
  - `useEffect` + `addEventListener('change')` でOS設定変更時にリアクティブに更新する
  - 戻り値は `boolean`（true = モーション削減）のみとし、型安全を保つ
  - このフックは ForestAnimationLayer と ParticleCanvas の両方で利用される基盤となる
  - _Requirements: 2.5, 3.5_

- [x] 2. (P) LoginPageLayout の深緑背景ページラッパー実装
- [x] 2.1 (P) ログイン画面全体を覆う深緑グラデーション背景レイヤーを作成する
  - `min-h-screen` で viewport 全体をカバーし、moriテーマのカラーパレット（`#00552e` → `#1a4d2e` → `#47885e`）によるグラデーション背景を適用する
  - アニメーション・パーティクルを `position: absolute; inset: 0; pointer-events: none` のレイヤーとして配置する領域を確保する
  - `children`（AuthForm）を `z-index: 10` 以上の前面に表示し、フォームカードをセンタリングする
  - ライトモード・ダークモード問わず同一の深緑テーマを維持する（メディアクエリによるテーマ切り替えは行わない）
  - _Requirements: 1.1, 1.4, 6.1, 6.2_

- [x] 3. (P) ForestAnimationLayer の CSS 背景アニメーション実装
- [x] 3.1 (P) 霧（モヤ）の流れアニメーションを実装する
  - 白半透明の要素が画面を横切るように緩やかに流れる `fog-drift` キーフレームアニメーションを CSS で定義する（周期: 20s、opacity 0〜0.3 の変化）
  - アニメーション要素に `pointer-events: none` を付与しフォーム操作を妨げない
  - `useReducedMotion` が `true` の場合は `animation: none` を適用してアニメーションを停止する
  - _Requirements: 2.1, 2.4, 2.5_

- [x] 3.2 (P) 葉の漂いアニメーションを実装する
  - 葉の形状を模した 2〜4 個の半透明要素が画面上をゆっくり漂う `leaf-float` キーフレームアニメーションを CSS で定義する（周期: 15〜25s、要素ごとに `animation-delay` で差分を付ける）
  - 純粋な CSS/SVG のみで実装し、外部 JavaScript ライブラリは一切使用しない
  - `useReducedMotion` が `true` の場合は停止する
  - _Requirements: 2.2, 2.4, 2.5, 6.2_

- [x] 3.3 背景の波打ちアニメーションと reduced-motion 統合対応を実装する
  - 背景グラデーションの `background-position` を変化させ波打つような `wave-pulse` キーフレームアニメーションを CSS で定義し、ページ読み込み時から継続的にループする（周期: 12s）
  - `@media (prefers-reduced-motion: reduce)` メディアクエリと `useReducedMotion` フックによる JS フラグの二重制御で全アニメーションを一元的に停止できるようにする
  - _Requirements: 2.3, 2.5_

- [x] 4. (P) ParticleCanvas のマウスパーティクルシステム実装
- [x] 4.1 (P) Canvas 要素のセットアップとマウス位置追跡を実装する
  - `<canvas>` 要素を `position: absolute; inset: 0; pointer-events: none` で背景レイヤーに配置し、ウィンドウリサイズに合わせてサイズを動的に更新する
  - `mousemove` イベントをリスンし、カーソル座標を取得する
  - タッチデバイス（`pointer: coarse`）を検出した場合は Canvas を非表示にしイベントを登録しない
  - `useReducedMotion` が `true` の場合は Canvas を非表示にする
  - _Requirements: 3.1, 3.2, 3.5, 3.6_

- [x] 4.2 (P) パーティクルのライフサイクル管理と描画ループを実装する
  - `mousemove` 発火ごとにパーティクルオブジェクト（座標・速度・半径・不透明度・寿命・色）を生成し、配列で管理する
  - パーティクルの色は深緑・ゴールド系（`#86efac` / `#22c55e` / `#fbbf24` / `#ffffff`）からランダムに選択する
  - `requestAnimationFrame` フレームループで全パーティクルの位置更新・フェードアウト・削除を行い、`clearRect` + 再描画する
  - 同時存在パーティクル数の上限を 50 個とし、超過時は最古のものを削除する
  - コンポーネントアンマウント時に `cancelAnimationFrame` でループを確実に停止しメモリリークを防ぐ
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4.3 フレームレート制御と高負荷時の自動軽量モードを実装する
  - `deltaTime` を監視し、16ms 超のフレームが連続した場合はパーティクル生成を一時停止する軽量モードに自動切替する
  - 描画ループ全体を通じてフレームレートが 60fps 以下に収まるよう制御する
  - _Requirements: 3.4, 6.5_

- [x] 5. (P) フォームコンポーネントへの森テーマスタイル適用
- [x] 5.1 (P) OAuthLoginButton に forest variant を追加する
  - `variant?: 'default' | 'forest'` prop を追加し、`forest` 指定時は全プロバイダー共通で半透明ダーク背景・緑系ボーダー・緑系テキストのスタイルを適用する（`bg-black/40 border border-green-700 text-green-100 hover:bg-black/60`）
  - プロバイダーアイコン SVG はそのまま維持し、ビジュアルのみ変更する
  - `variant` prop はオプションとし、省略時（`default`）は現行スタイルを維持して後方互換性を保つ
  - _Requirements: 4.4, 5.6, 6.3_

- [x] 5.2 (P) EmailAuthForm の森テーマスタイルへ変更する
  - フォームカードを `bg-black/75 rounded-lg border border-green-300/30 shadow-2xl backdrop-blur-sm` に変更する
  - 入力フィールドを `bg-black/40 border-green-700 text-green-100 focus:ring-emerald-500 focus:border-emerald-500` に変更する
  - 送信ボタンを `bg-emerald-700 hover:bg-emerald-600` に変更し、loading状態に緑系パルスアニメーションを追加する
  - 区切り線を `border-green-800`、区切りラベルを `bg-transparent text-green-600` に変更する
  - エラー/成功メッセージを `bg-red-900/50 text-red-300` / `bg-emerald-900/50 text-emerald-300` に変更する
  - `<OAuthLoginButton>` に `variant="forest"` を渡す
  - ラベルの `htmlFor`/`id` 対応、ARIA属性は変更しない
  - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.3, 4.5, 4.6, 5.6, 6.3, 6.4_

- [x] 5.3 (P) OAuthInviteForm の森テーマスタイルへ変更する
  - フォームカードを EmailAuthForm と同じ半透明ダーク + 緑系ボーダースタイルに変更する
  - `providerStyles` ディクショナリを森テーマパレット（半透明ダーク背景・緑テキスト）で書き換える
  - 入力フィールドを共通の森テーマスタイルに統一する
  - _Requirements: 1.2, 4.1, 4.2, 5.6_

- [x] 5.4 (P) PasswordResetForm の森テーマスタイルへ変更する
  - フォームカードを半透明ダーク + 緑系ボーダーに変更する
  - 入力フィールド・送信ボタン・リンクテキストを森テーマパレットに統一する
  - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.3, 5.6_

- [x] 6. 全コンポーネントの統合: AuthForm に LoginPageLayout を組み込む
- [x] 6.1 AuthForm を LoginPageLayout でラップし、既存の全認証フローと接続する
  - `AuthForm.tsx` の return 文を `<LoginPageLayout>` でラップし、ForestAnimationLayer・ParticleCanvas が背景として表示される状態にする
  - `AuthForm` のモード管理・OAuth状態管理・`useEffect` によるコールバック処理は一切変更しない
  - OAuthInviteForm・PasswordResetForm モードでも LoginPageLayout が適用されることを確認する
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 7. テスト・品質検証
- [x] 7.1 useReducedMotion フックのユニットテストを作成する
  - `window.matchMedia` をモックし、`true`/`false` の切り替えが正しく検出されることを検証する
  - OS設定変更イベントに対してリアクティブに値が更新されることを確認する
  - _Requirements: 2.5, 3.5_

- [x] 7.2 認証フローの統合テストを実施する
  - メール/パスワードでのログイン・新規登録フォームが送信ハンドラーを正常に呼び出すことを確認する
  - `variant="forest"` の OAuthLoginButton がクリック時に既存の OAuth 関数を呼び出すことを確認する
  - フォームの全インタラクティブ要素がキーボード操作（Tab/Enter）でアクセス可能なことを確認する
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.3, 6.4_

- [x]\* 7.3 E2E テストで全認証フローの動作を確認する
  - ログイン・新規登録・OAuth招待コード・パスワードリセットの各フローが画面上で正常動作することを確認する
  - `?error=invitation_required` パラメータで OAuthInviteForm が正しく表示されることを確認する
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x]\* 7.4 パフォーマンスを検証する
  - FCP 2084ms（基準3秒以内）✅
  - パーティクル生成中もメインスレッドブロックなしでフォーム操作可能 ✅
  - バンドルに外部アニメーションライブラリ（three.js/gsap等）が含まれていないことを確認 ✅
  - _Requirements: 6.1, 6.2, 6.5_
