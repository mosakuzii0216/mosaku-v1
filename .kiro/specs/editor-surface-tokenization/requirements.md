# Requirements Document

## Project Description (Input)

エディタ面のトークン化（editor-surface-tokenization）。theme-immersive-world で確立した shell トークン層（Layer①: tokens.css / primitives.css）を、玄関6面から「エディタ面」へ縦展開する。

### 背景と問題

theme-immersive-world は玄関6面（ヘッダー・サイドバー・カード等）を `.shell-*` トークン駆動化して完了したが、エディタ周辺まで到達していない。その結果、森テーマ（深緑の面）を有効にしてメモ編集画面を開くと、ツールバーのボタン群（太字/斜体/取消線/H1/H2/リスト/引用）が白いまま浮き、世界観が途切れる。実描画スクリーンショットで確認済み。

### 対象と現状インベントリ（直書き色の実測）

エディタ中核:

- `components/editor/RichTextEditor.tsx:115` ツールバー境界 `border-gray-200`
- `components/editor/RichTextEditor.tsx:122-135` トグルボタン。アクティブ `bg-blue-500 text-white` / 非アクティブ `bg-white text-gray-700 border border-gray-300` / hover `bg-blue-500 text-white`
- `components/editor/RichTextEditor.tsx:71` ProseMirror に `text-gray-900` を直付け
- `components/editor/EditorBubbleMenu.tsx:13,56` 同じボタンパターン＋フローティング面 `bg-white shadow-lg border-gray-200`
- `components/editor/SlashCommandList.tsx:72-108` ポップオーバー `bg-white`、選択状態 `bg-blue-50`、説明文 `text-gray-500`

周辺（同一の病気・スコープ判断が必要）:

- `components/memo/MemoPalette.tsx` 18箇所（最多）
- `components/memo/TrashView.tsx` 9箇所
- `components/memo/MemoSearch.tsx` 4箇所
- `components/memo/ShareMemoControl.tsx` 3箇所

### 設計上の論点（requirements/design で解くべきこと）

1. トグル/選択状態のトークンが未整備。tokens.css には `--state-hover` / `--state-selected` / `--on-state-selected` / `--accent` / `--on-accent` が存在するが、`.shell-button` にはトグル状態（aria-pressed）の表現が無い。エディタのボタンは「太字 ON/OFF」という二値状態を持つため、押下状態を表すプリミティブが要る。
2. フローティング面（バブルメニュー・スラッシュコマンド）の面設計。`.shell-panel` / `.shell-card` で足りるか、ポップオーバー専用の elevation とスクリムが要るかを決める。
3. Layer③（`public/themes/{name}/*.css` の `.memo-content` 系）との境界線。本文面のタイポと配色はテーマ CSS が既に持っているため、ツールバー/ポップオーバーは shell 側、本文面は Layer③ 側、と責務を分けて二重管理を避ける。
4. prose の色上書き問題。`@tailwindcss/typography` の `prose-*` は ProseMirror 要素へ font-size/line-height/色を直接敷くため、親のトークンが届かない。表示モードでは `.display-mode-content .ProseMirror` で詳細度を1段上げ、`--tw-prose-*` を currentColor へ寄せる手法で解決済み（`index.css`）。同じ手法をエディタ面へ展開するかを決める。
5. スコープ確定。エディタ中核3ファイルに限定するか、MemoPalette 等の周辺4ファイルまで含めるか。

### 制約

- 既存の不変則を維持する。色は必ず `var(--token)` 経由で、コンポーネントに直書きしない。
- 非森ユーザーの初期バンドルを増やさない（theme-immersive-world の 7.5 と同じ制約）。
- 重要な前提: shell トークンは現状 mori にしか定義されていない（tokens.css で mori 35個 / umi・yoru・asa は 0個）。本 spec は「トークンを参照する側」を整備するもので、umi/yoru/asa への値供給は別 spec（横展開）の担当。本 spec 完了後、その横展開が入れば自動的に4テーマへ波及する設計にすること。
- アクセシビリティ: トグル状態は色だけで表さず `aria-pressed` を伴わせる。コントラストは AA(4.5:1) を満たすこと。

### 検証方針

実描画の検証はユニットテストでは担保できないため、Playwright の computed style 検証を用いる（`frontend/e2e/display-mode-theme.spec.ts` と同方式・バックエンド全面モックで backend 不要）。回帰ガードとして「Tailwind の直書き値に戻ったら落ちる」アサーションを置く。

## Introduction

本スペックは、theme-immersive-world で確立した shell トークン層（Layer①: `frontend/src/themes/shell/tokens.css` ＋ `primitives.css`）を、玄関6面（Header / MemoList / MemoItem / RecentMemoCard / ShellThemeSelector / MemoEditor）から**エディタ面へ縦展開**する。

現状、森テーマを有効にして編集画面を開くと、深緑の世界の上にツールバーのボタン群が白いまま浮き、世界観が途切れる。構造上の原因は明確で、Layer③（`public/themes/mori/mori.css`）の `.theme-root .memo-content` は `RichTextEditor` を内包するラッパーへ文字色を敷いているにもかかわらず、その内側のツールバー・浮遊面・ProseMirror が生の Tailwind 配色（`bg-white` / `text-gray-700` / `bg-blue-500` / `text-gray-900`）で**世界にフタをしている**ためである。玄関の没入は完成しているのに、ユーザーが最も長く滞在する「書く場所」で世界が切れる、という非対称が残っている。

本スペックはこのフタを外す。ただし単なる色の置換ではなく、エディタ面が持つ固有の要求を**トークン語彙の拡張として**解決する。すなわち (1) 書式ボタンが持つ「太字 ON/OFF」という二値のトグル状態を表す状態表現、(2) 本文の上に重なる浮遊面（バブルメニュー／スラッシュコマンド候補／メモパレット）の面設計、(3) `@tailwindcss/typography` の `prose-*` が本文編集面のテーマ文字色を上書きする問題、の3つである。

重要な前提として、shell トークンの**値**は現状 mori にしか実装されていない（umi / yoru / asa は tokens.css 内で placeholder のまま）。本スペックは**トークンを参照する側**を整備するものであり、他3テーマへの値供給は後続の横展開スペックが担う。したがって本スペックは「後続が値を与えるだけで4テーマ全部のエディタ面へ自動的に波及する」設計であることを要件に含める。

制約は theme-immersive-world を継承する。外部 JS ライブラリ追加ゼロ、非森ユーザーの初期バンドル不増、コンポーネントへの生カラーリテラル直書き禁止、コントラスト AA 以上。検証は実描画に踏み込む必要があるため Playwright の computed style 検証（バックエンド全面モック）を主軸とし、「Tailwind の直書きへ戻ったら落ちる」回帰ガードを併置する。

### Requirement Grouping

- **スコープの確定**: Requirement 1（対象面の境界と完了条件）
- **エディタ面固有のトークン拡張**: Requirement 2（トグル状態） / Requirement 3（浮遊面） / Requirement 4（本文編集面のテーマ追随）
- **構造の健全性**: Requirement 5（Layer① と Layer③ の責務分離）
- **品質の保証**: Requirement 6（可読性・アクセシビリティ）
- **横展開の基盤化**: Requirement 7（海・夜・朝への自動波及）
- **制約遵守と回帰防止**: Requirement 8（非干渉・軽量・回帰ガード）

## Requirements

### Requirement 1: 対象スコープの確定（エディタ面と周辺面の境界）

**Objective:** As a Mosaku 開発者, I want 本スペックでトークン化する面の境界と「完了」の機械的定義を明文化したい, so that 取りこぼしと際限ないスコープ拡大の両方を防ぎ、後続スペックとの責任分界を残せる

#### Acceptance Criteria

1. The Mosaku Editor Surface shall 本スペックの一次対象を「エディタ中核3面（ツールバー ＝ `RichTextEditor` / 選択時バブルメニュー ＝ `EditorBubbleMenu` / スラッシュコマンド候補 ＝ `SlashCommandList`）」と定義する
2. The Mosaku App Shell shall 本スペックの二次対象を「編集画面に重なる浮遊面および玄関6面から漏れた周辺面（`MemoPalette` / `ShareMemoControl` / `TrashView` / `MemoSearch` / `MemoEditor` の残存直書き）」と定義し、一次対象と同一のトークン語彙・質感プリミティブで解決する
3. Where 二次対象の面が新たな質感表現を必要とする場合, the Mosaku Theme System shall 一次対象のために定義したプリミティブを再利用し、面ごとの専用クラスを新設しない
4. If 一次・二次対象のいずれかのファイルに生の Tailwind 配色ユーティリティ（`bg-white` / `text-gray-*` / `bg-blue-*` / `border-gray-*` 等）が残存する場合, then the Mosaku Quality Gate shall 自動テストを失敗させる
5. The Mosaku Editor Surface shall 本文面のタイポグラフィ定義（`.memo-content` 配下の見出し・引用・コード・表・コールアウト等の字階層とマージン）を本スペックのスコープ外とし、Layer③ のテーマ CSS に残す
6. The Mosaku Editor Surface shall 本スペックのスコープを配色・状態表現・面の質感に限定し、エディタの機能追加・レイアウト変更・情報設計の変更を含めない

### Requirement 2: トグル状態のトークン契約（押下状態プリミティブ）

**Objective:** As a Mosaku ユーザー, I want ツールバーの「太字 ON / OFF」のような二値状態を森の世界の中でもはっきり見分けたい, so that 世界観に浸ったまま、いま適用されている書式を誤認せずに編集できる

#### Acceptance Criteria

1. The Mosaku Theme System shall トグル操作要素の押下（ON）状態を表す状態表現を、テーマ名を含まない theme-neutral な質感プリミティブとして質感層に備える
2. When ユーザーがツールバーの書式ボタンを ON にした時, the Mosaku Editor Surface shall 押下状態を状態トークン（選択層の地と、その上で読める文字のペア）で描画し、生のカラーリテラルを用いない
3. The Mosaku Editor Surface shall 押下状態を色の違いだけで伝達せず、`aria-pressed` 属性を伴わせて支援技術にも状態を伝える
4. While 書式ボタンが押下（ON）状態にある時, the Mosaku Editor Surface shall 非押下（OFF）状態との間に識別可能な視覚差を保つ
5. When ユーザーが非押下（OFF）のボタンにホバーした時, the Mosaku Editor Surface shall ホバー層の状態トークンでフィードバックを提示し、押下（ON）状態と同一の見た目にならないようにする
6. While ボタンが無効（disabled）な時, the Mosaku Editor Surface shall 操作不可であることを提示しつつ、判読可能な最小コントラストを下回らないようにする

### Requirement 3: 浮遊面（ポップオーバー）の面設計

**Objective:** As a Mosaku ユーザー, I want バブルメニュー・スラッシュコマンド候補・メモパレットが本文の上に浮いても世界と地続きであってほしい, so that 書いている流れの中に白い箱が突然現れて没入が切れない

#### Acceptance Criteria

1. The Mosaku Theme System shall 本文の上に重なる浮遊面（バブルメニュー／スラッシュコマンド候補／メモパレット）の地・文字・境界・奥行きを、既存のセマンティックトークン語彙で解決する面プリミティブとして定義する
2. When 浮遊面が本文の上に表示された時, the Mosaku Editor Surface shall 下地の本文・面と識別できる奥行き（エレベーション）と境界を提示する
3. While スラッシュコマンド候補が表示されている状態で, the Mosaku Editor Surface shall 選択中の候補を状態トークンで示し、非選択の候補と判別可能なコントラストを保つ
4. The Mosaku Editor Surface shall 浮遊面内の補助テキスト（コマンド説明文・件数・空状態メッセージ等）を低強調トークンで描画し、判読可能な最小コントラストを下回らないようにする
5. When 浮遊面をトークン駆動へ置換した時, the Mosaku Editor Surface shall 既存の表示条件（選択の有無・表内／コールアウト内の文脈判定）とキーボード操作（上下移動・Enter 確定・サブメニューからの戻る）の挙動を変更しない
6. Where 浮遊面がスウォッチ（色見本）を含む場合, the Mosaku Editor Surface shall スウォッチが示すエディタ意味色パレットの値自体はテーマ非依存の自己完結値のまま維持し、スウォッチを載せる面のみをトークン化する

### Requirement 4: 本文編集面のテーマ追随（prose 上書きの解消）

**Objective:** As a Mosaku ユーザー, I want 編集中の本文が表示モードと同じようにテーマの文字色で表示されてほしい, so that 「読むとき」と「書くとき」で世界が変わらない

#### Acceptance Criteria

1. When 森テーマが適用された編集画面を開いた時, the Mosaku Editor Surface shall 本文編集領域（ProseMirror）の文字色をテーマ由来の文字色で描画し、生の固定色（`text-gray-900`）を直当てしない
2. The Mosaku Editor Surface shall `@tailwindcss/typography` の `prose-*` 既定色が本文編集領域のテーマ文字色を上書きしない状態を保証する
3. The Mosaku Editor Surface shall 見出し・引用・リンク・リスト記号・区切り線など prose が独自の色を持つ要素についても、本文と同じ文字色系統に追随させる
4. While テーマが適用されていない状態（`data-theme` 未設定・公開ビュー）で, the Mosaku Editor Surface shall 本スペック実装前と同等の中立配色（白面・暗文字）で本文を描画する
5. The Mosaku Editor Surface shall 本文編集面のフォントサイズ・行間・字間を本スペックで新たに定義せず、Layer③ のテーマ CSS が持つ値に従う
6. When 同一メモを編集画面と表示モードで開いた時, the Mosaku Editor Surface shall 双方で同一系統のテーマ文字色を解決し、面をまたいだ配色の断絶を生じさせない

### Requirement 5: Layer① と Layer③ の責務分離（二重管理の防止）

**Objective:** As a Mosaku 開発者, I want ツールバー／浮遊面（Layer①）と本文面（Layer③）の責務境界を確定したい, so that 同じ見た目を2箇所で定義して片方だけ直す事故を構造的に防げる

#### Acceptance Criteria

1. The Mosaku Theme System shall ツールバー・浮遊面・周辺面の配色と質感を Layer①（バンドル同梱のトークン／質感プリミティブ）に置く
2. The Mosaku Theme System shall 本文面（`.memo-content` 配下）のタイポグラフィと配色を Layer③（`public/themes/{name}/*.css`、当該テーマ有効時のみ fetch）に残す
3. The Mosaku Theme System shall 同一の視覚プロパティを Layer① と Layer③ の双方で定義しない
4. When エディタ面のために新しい色・状態が必要になった時, the Mosaku Theme System shall 既存のセマンティックトークン語彙へ役割として追加し、コンポーネント側および Layer③ に個別の色を追加しない
5. The Mosaku Theme System shall Layer① へ追加する定義から重量物（テクスチャ画像・data-URI・テーマ固有の装飾）を排除し、色・状態・構造のトークン参照のみで構成する
6. The Mosaku Theme System shall Layer① の追加定義をクラスセレクタで構成し、汎用 HTML 要素の文字色を要素型セレクタで直接上書きしない（過去のヘッダー文字消失と同型の詳細度衝突の再発防止）

### Requirement 6: 可読性・アクセシビリティの保証

**Objective:** As a Mosaku ユーザー, I want 森の暗い面の上でもツールバーと浮遊面の文字・状態が確実に読める, so that 没入のために操作性と可読性が犠牲にならない

#### Acceptance Criteria

1. While 森テーマが適用された状態で, the Mosaku Editor Surface shall ツールバー・浮遊面・周辺面のテキストと背景のコントラスト比を WCAG AA（本文 4.5:1 以上・大きな文字 3:1 以上）以上に保つ
2. Where 面が半透明で生きた背景を透かす場合, the Mosaku Theme System shall 背景の最明値が透けた worst-case 合成でもコントラスト AA を満たすことを機械検証する
3. When ユーザーがキーボードでツールバー・浮遊面の操作要素へフォーカスした時, the Mosaku Editor Surface shall 背景と区別可能なフォーカスリングを提示する
4. The Mosaku Editor Surface shall 状態（押下・選択・ホバー・無効）を色のみで伝達せず、属性または形状の手がかりを併用する
5. While `prefers-reduced-motion: reduce` が有効な状態で, the Mosaku Editor Surface shall 状態遷移のモーションを停止し、配色・奥行き・余白の静的な質感は維持する
6. The Mosaku Editor Surface shall トークン化にあたり既存のアクセシブルネーム（ボタンラベル・`role` / `aria-label` によるグループ化）を後退させない

### Requirement 7: 海・夜・朝への自動波及（相乗り基盤）

**Objective:** As a Mosaku 開発者, I want エディタ面のトークン化を「参照側の整備」に徹したい, so that 後続の横展開スペックが値を供給するだけで4テーマ全部のエディタ面へ世界観が波及する

#### Acceptance Criteria

1. The Mosaku Theme System shall エディタ面が参照するトークンを、4テーマ（mori / umi / yoru / asa）共通の役割名で解決する
2. Where 海・夜・朝が同一役割名のトークンに値を与える場合, the Mosaku Editor Surface shall コンポーネントおよび質感プリミティブのコードを変更せずに当該テーマの世界観をエディタ面へ適用できる設計とする
3. The Mosaku Theme System shall 本スペックでの値実装を mori および中立既定（`:root`）に限定し、umi / yoru / asa への値供給は後続の横展開スペックに委ねる
4. The Mosaku Theme System shall 本スペックで新設するトークン役割を、明テーマ（朝）でも暗テーマ（森・海・夜）でも成立する明暗反転耐性のある契約として定義する
5. The Mosaku Editor Surface shall テーマ名（`mori` 等）をコンポーネントおよび質感プリミティブ層に直接記述しない
6. The Mosaku Theme System shall 新設するトークン役割ごとに、面と前景文字を可読性の成立するペアとして定義する

### Requirement 8: 非干渉・軽量・回帰ガード

**Objective:** As a Mosaku ユーザー兼開発者, I want トークン化がエディタの機能・軽量性・既存テストを壊さないことを保証したい, so that 見た目の改善が編集体験の劣化と引き換えにならない

#### Acceptance Criteria

1. When ユーザーが森以外のテーマまたはテーマ未設定でエディタを開いた時, the Mosaku Editor Surface shall 本スペック実装前と同等の中立配色（白面・暗文字・青アクセント）を描画し、可読性を後退させない
2. The Mosaku Theme System shall 外部 JS ライブラリを新規追加せず、非森ユーザーの初期バンドルサイズを本スペック実装前から増加させない
3. The Mosaku Editor Surface shall トークン化によって書式トグル・スラッシュコマンド・バブルメニュー・コンテンツ同期・自動保存の既存挙動を変更しない
4. The Mosaku Quality Gate shall エディタ面の実描画配色（computed style）が期待するトークン値へ解決されることを、バックエンドに依存しない Playwright E2E で検証する
5. If 対象コンポーネントの配色が生の Tailwind 直書きへ戻された場合, then the Mosaku Quality Gate shall 自動テストを失敗させる
6. The Mosaku Quality Gate shall 既存のフロントエンドユニットテストおよび E2E を、本スペックの実装後も全て緑のまま維持する
7. The Mosaku Theme System shall バックエンド／DB スキーマを変更せず、テーマの実体を CSS 本体＋メタデータのままとする
