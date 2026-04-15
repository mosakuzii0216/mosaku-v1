# Requirements Document

## Project Description (Input)

mosaku-brand-theme: ログイン画面の深緑の森デザイン（login-visual-redesign）をアプリ本体にも適用するMosakuブランドテーマを実装する。既存の`mori`テーマを全面リライトし、Mosakuのフラッグシップテーマとして位置付ける。

### 背景・目的

Mosakuの差別化軸は「ハイセンスなデザイン・テーマ数の多さ・ブランディングの雰囲気」。ログイン画面で実現した深緑の森の世界観（深緑グラデーション背景・CSS霧/葉/波アニメーション・マウス追跡パーティクル）をアプリ本体にも持ち込み、ログイン前後で一貫したブランド体験を提供する。Forestテーマ=Mosakuテーマと定義し、ブランドの顔となる正式テーマとして整備する。

### スコープ（1スペック・Phase A → Phase B の順でタスク化）

#### Phase A: CSSのみで実装（低コストで即効果）

- `frontend/public/themes/mori/mori.css` を深緑フルリライト
  - 深緑グラデーション背景（ログイン画面と同じ配色に寄せる）
  - `wave-pulse` アニメーション（既存 `gradientShift` を12s周期に調整）
  - `fog-drift` アニメーション: `.theme-root::before` と `::after` の擬似要素2層で白半透明の霧を表現
  - カード/入力欄/ボタン/リンク等のフォーム風UI要素の色味を森テーマに統一
  - `prefers-reduced-motion: reduce` 対応（CSSメディアクエリで全アニメ停止）
- テーマ適用スコープの拡張: 現状メモ本文だけに当たっている `.theme-root` を、サイドバー・ヘッダー含むアプリ全体レイアウトに拡張する
- 他テーマ（kami/aka/kuro/siro/ao/code）への影響ゼロを保証

#### Phase B: テーマシステムへJSエフェクト基盤を追加

- `Theme` 型を拡張し、テーマが任意でJSエフェクトコンポーネントを持てる汎用設計にする（将来の夜空テーマで流れ星、桜テーマで花びらパーティクル等でも再利用可能）
- `mori` テーマ選択時のみ、login-visual-redesign で実装済みの `ForestAnimationLayer`（葉の漂い）と `ParticleCanvas`（マウス追跡パーティクル）を動的マウントする
- 既存コンポーネントの再利用を基本方針とする

#### Phase B の必須制約（軽量メモアプリ方針と両立させるため）

1. **Dynamic import（コード分割）**: 森テーマ選択時のみ JSエフェクトバンドルを動的ロード。他テーマ選択ユーザーのバンドルサイズは増やさない
2. **エディタフォーカス中は自動停止**: TipTap の onFocus/onBlur で `requestAnimationFrame` を `cancelAnimationFrame` する。書いている間はエフェクト完全停止
3. **タブ非表示時に停止**: `document.visibilityState === 'hidden'` で RAF停止、バックグラウンドタブのバッテリー消費ゼロ
4. **アイドル検出**: mousemove が3秒なかったら RAF停止、次の mousemove で再開。「動かしている瞬間」だけエフェクトが動く
5. **タッチデバイスはパーティクル完全スキップ**: 既存の `pointer: coarse` 検出を踏襲

### 技術的制約

- 外部JSライブラリ追加ゼロ（バンドルサイズ増加を最小化）
- login-visual-redesign で作成済みの `ForestAnimationLayer` / `ParticleCanvas` / `useReducedMotion` を再利用
- バックエンド変更なし
- 既存の認証フロー・メモ編集ロジックには一切影響を与えない

### 非スコープ

- 他テーマ（kami/aka/kuro/siro/ao/code）のリライト
- モバイル専用ジェスチャーインタラクション
- 新規テーマの追加（mosaku-brand-theme は `mori` テーマの拡張として扱う）

## Introduction

本スペックは、ログイン画面で確立した「深緑の森」の世界観をMosaku本体アプリに拡張し、`mori` テーマをMosakuのフラッグシップ（＝ブランドの顔）テーマとして整備するものである。Phase A では純CSSのみでリライトとスコープ拡張を行い、Phase B ではテーマシステム側に汎用的なJSエフェクト基盤を追加して、`mori` 選択時のみログイン画面と同じアニメーションレイヤー（葉の漂い・マウス追跡パーティクル）を動的マウントする。軽量メモアプリとしての品質を維持するため、他テーマへの影響ゼロ・バンドル分離・編集中の自動停止・アクセシビリティ対応を必須制約として定義する。

### Requirement Grouping

- **Phase A（CSS完結・低コスト / 先行リリース可能）**: Requirement 1 / Requirement 2 / Requirement 3 / Requirement 4 の CSS 側条件
- **Phase B（JSエフェクト基盤 / Phase A 完了後に着手）**: Requirement 5 / Requirement 6 / Requirement 7 / Requirement 4 の JS 側条件

## Requirements

### Requirement 1: 深緑森テーマ CSS の全面リライト（Phase A）

**Objective:** As a Mosakuユーザー, I want `mori` テーマ選択時にログイン画面と同じ深緑の森の世界観をアプリ本体でも体験できる, so that ログイン前後で一貫したブランド体験を味わえる

#### Acceptance Criteria

1. When ユーザーが `mori` テーマを選択した時, the Mosaku Theme System shall `frontend/public/themes/mori/mori.css` を適用し、深緑グラデーション背景（ログイン画面 login-visual-redesign と同じ配色トーン）を `.theme-root` にレンダリングする
2. When `mori` テーマが適用されている時, the Mosaku Theme System shall `wave-pulse` アニメーション（既存 `gradientShift` を 12 秒周期に調整したもの）で背景グラデーションを周期的に変化させる
3. When `mori` テーマが適用されている時, the Mosaku Theme System shall `.theme-root::before` と `.theme-root::after` の擬似要素 2 層を用いた `fog-drift` アニメーションで、白半透明の霧を画面上にゆっくり流す
4. The Mosaku Theme System shall カード・入力欄・ボタン・リンク等のフォーム風UI要素の色味（背景色・文字色・ボーダー色・フォーカスリング色）を森テーマのパレットに統一する
5. The Mosaku Theme System shall 上記をすべて CSS のみで実装し、`mori.css` 以外のファイルを変更せずに Phase A の視覚効果を完成させる

### Requirement 2: テーマ適用スコープのアプリ全体への拡張（Phase A）

**Objective:** As a Mosakuユーザー, I want テーマの背景・色味がメモ本文だけでなくサイドバー・ヘッダーを含むアプリ全体に適用される, so that 画面のどこを見ても森の世界観に没入できる

#### Acceptance Criteria

1. When ユーザーがアプリにログインした時, the Mosaku Theme System shall `.theme-root` クラスをメモ本文だけでなくサイドバー・ヘッダーを含むアプリ全体レイアウトのルート要素に適用する
2. While `mori` テーマが有効な状態で, the Mosaku Theme System shall サイドバー・ヘッダー・メモ本文・モーダル等すべての主要UI領域にテーマ変数（背景色・文字色・アクセント色）を反映する
3. The Mosaku Theme System shall テーマ適用スコープの拡張によって既存のレイアウト構造（コンポーネント階層・DOM構造）を破壊しない
4. While テーマが切り替え中の状態で, the Mosaku Theme System shall スコープ拡張前と同じようにチラつきなくテーマを切り替える

### Requirement 3: 他テーマへの非干渉保証（Phase A / Phase B 共通）

**Objective:** As a Mosakuユーザー, I want `mori` 以外のテーマ（kami/aka/kuro/siro/ao/code）を選んだときに今まで通りの見た目で使える, so that 既存のお気に入りテーマが壊れない

#### Acceptance Criteria

1. When ユーザーが `kami` / `aka` / `kuro` / `siro` / `ao` / `code` のいずれかを選択した時, the Mosaku Theme System shall 本スペックの変更以前と同一の視覚的結果（背景・フォント・色味・アニメーションの有無）をレンダリングする
2. The Mosaku Theme System shall `mori.css` 内で定義するアニメーション・CSS変数・擬似要素を `mori` テーマの適用スコープ内にのみ限定し、他テーマの CSS ファイルや共通スタイルを変更しない
3. If ユーザーが `mori` 以外のテーマを選択した状態である時, the Mosaku Theme System shall `fog-drift` / `wave-pulse` / JSエフェクトレイヤーを DOM に追加せず、かつ関連する `requestAnimationFrame` も起動しない
4. The Mosaku Theme System shall 他テーマ適用時のバンドルサイズを本スペック実装前と比較して増加させない

### Requirement 4: アクセシビリティ（prefers-reduced-motion）対応（Phase A / Phase B 共通）

**Objective:** As a 視覚刺激を抑えたいユーザー, I want OS の「動きを減らす」設定を有効にしたときにアニメーションが停止する, so that めまい・体調不良を避けながら Mosaku を安全に使える

#### Acceptance Criteria

1. While OS の `prefers-reduced-motion: reduce` が有効な状態で, the Mosaku Theme System shall `mori` テーマの `wave-pulse` / `fog-drift` などすべての CSS アニメーションを停止する
2. While OS の `prefers-reduced-motion: reduce` が有効な状態で, the Mosaku Theme System shall Phase B の JSエフェクト（葉の漂い・マウス追跡パーティクル）の `requestAnimationFrame` ループを起動しない
3. Where Phase B の JSエフェクトが含まれる場合, the Mosaku Theme System shall login-visual-redesign 由来の `useReducedMotion` フックを再利用して OS 設定を検出する
4. While `prefers-reduced-motion: reduce` が有効な状態で, the Mosaku Theme System shall アニメーション停止後も森テーマの配色（背景グラデーション・フォーム色味）は維持する

### Requirement 5: テーマシステムのJSエフェクト基盤化（Phase B）

**Objective:** As a Mosaku開発者, I want テーマが任意で JSエフェクトコンポーネントを持てる汎用設計にしたい, so that 将来の夜空テーマ（流れ星）や桜テーマ（花びらパーティクル）でも同じ仕組みを再利用できる

#### Acceptance Criteria

1. The Mosaku Theme System shall `Theme` 型に JSエフェクトコンポーネントを任意で宣言できるフィールド（例: 動的インポート関数を保持するフィールド）を追加する
2. Where テーマが JSエフェクトコンポーネントを宣言している場合, the Mosaku Theme System shall そのテーマが選択された時のみ当該コンポーネントをマウントする
3. Where テーマが JSエフェクトコンポーネントを宣言していない場合, the Mosaku Theme System shall いかなる JSエフェクトもマウントせず、追加の RAF ループを起動しない
4. The Mosaku Theme System shall 本基盤を追加するにあたり、`mori` 以外の既存テーマ（kami/aka/kuro/siro/ao/code）の定義を変更しない
5. The Mosaku Theme System shall 新規 JSライブラリを追加せず、React と既存フック（login-visual-redesign 由来の `ForestAnimationLayer` / `ParticleCanvas` / `useReducedMotion`）のみで基盤を実現する

### Requirement 6: `mori` 選択時の JSエフェクト動的マウント（Phase B / コード分割）

**Objective:** As a 他テーマ利用者, I want `mori` テーマを使わない限り JSエフェクトのコードが自分のバンドルに混ざらない, so that 軽量メモアプリとしての読み込み速度を維持できる

#### Acceptance Criteria

1. When ユーザーが `mori` テーマを選択した時, the Mosaku Theme System shall `ForestAnimationLayer`（葉の漂い）と `ParticleCanvas`（マウス追跡パーティクル）を動的インポートしてアプリレイアウトにマウントする
2. While ユーザーが `mori` 以外のテーマを選択している状態で, the Mosaku Theme System shall `ForestAnimationLayer` / `ParticleCanvas` のバンドルを読み込まない
3. The Mosaku Theme System shall JSエフェクトを動的インポートするコード分割（dynamic import）によって、非 mori ユーザー向けの初期バンドルサイズを Phase B 実装前と比較して増加させない
4. When `mori` テーマから他テーマに切り替えた時, the Mosaku Theme System shall マウント済みの JSエフェクトコンポーネントを DOM から除去し、起動中の `requestAnimationFrame` をすべて `cancelAnimationFrame` で停止する
5. The Mosaku Theme System shall JSエフェクトのマウント・アンマウントにあたって既存の認証フローおよびメモ編集ロジックに副作用を与えない

### Requirement 7: JSエフェクトのパフォーマンス自動制御（Phase B）

**Objective:** As a 執筆中のMosakuユーザー, I want メモを書いている間・タブを閉じている間・触っていない間はエフェクトが止まる, so that バッテリー・CPU を無駄に消費せず執筆体験が妨げられない

#### Acceptance Criteria

1. When TipTap エディタが `onFocus` イベントを発火した時, the Mosaku Theme System shall `mori` テーマのすべての JSエフェクトの `requestAnimationFrame` を `cancelAnimationFrame` で停止する
2. When TipTap エディタが `onBlur` イベントを発火した時, the Mosaku Theme System shall 停止中の JSエフェクトを再開する（ただしアイドル・非表示・reduced-motion 等の他の停止条件を満たさない場合に限る）
3. While `document.visibilityState === 'hidden'` である状態で, the Mosaku Theme System shall `mori` テーマの JSエフェクトの `requestAnimationFrame` を停止する
4. While `mousemove` イベントが 3 秒間発火していない状態で, the Mosaku Theme System shall `mori` テーマの JSエフェクトの `requestAnimationFrame` を停止する
5. When 停止状態で `mousemove` イベントが再び発火した時, the Mosaku Theme System shall JSエフェクトの `requestAnimationFrame` を再開する
6. Where デバイスが `pointer: coarse`（タッチデバイス）と判定される場合, the Mosaku Theme System shall `ParticleCanvas`（マウス追跡パーティクル）をマウントも起動もしない
