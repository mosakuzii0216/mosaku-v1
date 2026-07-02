# Requirements Document

## Project Description (Input)

immersive-world-full — theme-immersive-world で作った玄関限定の没入世界をアプリ全域へ展開する。(G1) 生 Tailwind 色が残る33コンポーネントを .shell-\* プリミティブ/トークン駆動へ寄せ、玄関を出た先（memo編集・tag・notebook・settings・public・modal/overlay）も没入世界を連続させる。(G2) 游明朝の署名タイポを見出しへ、monospace をラベル/データへ届ける三役タイポを全域適用。(G3) 編集的な構造装置（.shell-eyebrow / 状態ピル .shell-chip / 番号付きセクション）を primitives.css に追加し Artifact 相当の質感を再現。旧 .theme-root 系統の一本化(G4)と umi/yoru/asa 実装(G5)は対象外＝後続spec。ドメイン単位（memo→tag→notebook→settings→public→modal）で段階適用し 1 Todo=1 Commit を維持。参照デザイン: このセッションで作成した森テーマ解説 Artifact（深緑地・署名グリーン#86efac・游明朝見出し・SVGノイズ・ガラス面）。

## Introduction

本スペックは、先行スペック **theme-immersive-world** が玄関（メモ一覧・ホーム・ヘッダーナビ）に確立した「セマンティックトークン契約＋質感 primitive 層（`.shell-*`）＋森リッチパック」の没入基盤を、**玄関を出た先のアプリ全域**へ展開する。

先行スペックで玄関は森の世界になったが、そこから一歩進んだ先——メモを編集する画面・タグを整理する画面・ノートブックを覗く画面・設定・公開ビュー・そして手前に開くモーダル/オーバーレイ——には、いまも生の Tailwind 色（`bg-white` / `text-gray-*` / `bg-blue-*` 等）で描かれた「既製品 UI の島」が残っている。この島がある限り、ユーザーは玄関で世界に入った直後に素の UI へ引き戻され、没入が断絶する。

本スペックはこの断絶を、**3 つの軸（G1/G2/G3）**で解消する。

- **G1 — カバレッジ拡張**: 生 Tailwind 色が残る 33 コンポーネント（memo編集・tag・notebook・settings・public・modal/overlay の各ドメイン）を、先行スペックの `.shell-*` primitive とセマンティックトークン駆動へ寄せ、玄関を出た先も世界を地続きにする。過去にロールバックを招いた「要素型セレクタで生の色を直当てする」轍は踏まず、面側にトークンを当てる契約を継承する。
- **G2 — 三役タイポグラフィ**: 「見出し／署名（游明朝 serif）」「ラベル／データ（monospace）」「本文（body）」の三役に字組みを役割分担し、アプリ全域へ一貫適用する。単なる色替えを超えた「編集された誌面」の質感を字組みから立ち上げる。
- **G3 — 編集的構造装置**: アイブロー（`.shell-eyebrow`）・状態ピル（`.shell-chip`）・番号付きセクションを `primitives.css` に theme-neutral な構造クラスとして追加し、参照 Artifact 相当の情報設計の質感を全域で再現できるようにする。

**参照デザインの北極星**は、このセッションで作成した森テーマ解説 Artifact（深緑地・署名グリーン `#86efac`・游明朝見出し・SVG ノイズ・ガラス面）である。到達目標の質感基準としてこれを用いる。

本スペックは先行スペック同様、**外部 JS ライブラリ追加ゼロ／バックエンド・DB スキーマ不変／非森テーマ（海・夜・朝）と既存機能（認証・メモ編集・自動保存・ゴミ箱）への非干渉**を必須制約とする。実装はドメイン単位（memo → tag → notebook → settings → public → modal）で段階適用し、**1 Todo = 1 Commit** を維持する。

**非スコープ（後続スペックに委ねる）**: 旧 `.theme-root` 系統の一本化（G4）／海・夜・朝のトークン値実装と全体没入（G5）。本スペックは森を対象とし、G4/G5 の受け皿は theme-neutral 構造として保つ。

### Requirement Grouping

- **G1 カバレッジ拡張**: Requirement 1（ドメイン全域のトークン駆動化・生 Tailwind 排除） / Requirement 2（玄関〜本文〜設定の没入連続性） / Requirement 3（modal/overlay の没入） / Requirement 4（公開ビューの世界連続）
- **G2 三役タイポグラフィ**: Requirement 5（三役タイポ語彙の確立と全域適用）
- **G3 編集的構造装置**: Requirement 6（`.shell-eyebrow` / `.shell-chip` / 番号付きセクションの primitive 追加）
- **品質保証（先行スペックからの継承）**: Requirement 7（可読性・コントラスト AA とロールバック回避の継承）
- **制約遵守・非対象の明示**: Requirement 8（非干渉・軽量・データ不変・G4/G5 非対象）

## Requirements

### Requirement 1: 玄関を出た先のトークン駆動化（生 Tailwind 排除・G1 カバレッジ）

**Objective:** As a Mosaku 開発者, I want 玄関を出た先の全ドメイン（memo編集・tag・notebook・settings・public・modal/overlay）の配色を生の Tailwind リテラルからセマンティックトークン／`.shell-*` primitive 駆動へ寄せたい, so that テーマが玄関で途切れず、ロールバックを招いた要素型直当てを避けたまま没入をアプリ全域へ広げられる

#### Acceptance Criteria

1. The Mosaku App Shell shall memo編集・tag・notebook・settings・public・modal/overlay の各ドメインの UI 面を、theme-immersive-world で確立した `.shell-*` primitive とセマンティックトークン経由で彩色する
2. When 上記ドメインのコンポーネントを描画する時, the Mosaku App Shell shall 面・文字・境界の彩色目的で生のカラーリテラル（Tailwind の `bg-white` / `text-gray-*` / `bg-blue-*` / `border-gray-*` 等）を用いない
3. The Mosaku App Shell shall 彩色を要素型セレクタ（`.theme-root button` 等）ではなくクラス選択子＋トークンで解決し、汎用 HTML 要素の文字色を直接上書きしない（ヘッダー文字消失の再発防止を継承する）
4. Where 既存の `.shell-*` primitive／トークンで表現できない面がある場合, the Mosaku Theme System shall 生リテラルを足すのではなく primitive／トークン語彙を拡張して対応する
5. The Mosaku App Shell shall 各ドメインのトークン駆動化を、既存のイベントハンドラ・ナビゲーション導線・フォーム送信などの機能を破壊せずに行う

### Requirement 2: 玄関〜本文〜設定を貫く没入の連続性（G1 世界の地続き）

**Objective:** As a Mosaku ユーザー, I want 玄関から先（メモを編集する・タグを整理する・設定を開く・ノートブックを覗く）へ進んでも同じ森の世界が途切れず続いてほしい, so that どの画面でも一つの世界に入っている没入感が「既製品 UI の島」で断絶しない

#### Acceptance Criteria

1. While 森テーマが有効な状態で, the Mosaku App Shell shall memo編集・tag・notebook・settings 画面の背景・面・文字・アクセントを森の世界観で描画し、玄関と地続きにする
2. When ユーザーが玄関から各ドメイン画面へ遷移した時, the Mosaku App Shell shall 不透明な既定 UI 地（`bg-white` 等）で生きた背景にフタをせず、半透明 surface 経由で背後の生きた世界を透かして連続させる
3. When 各ドメイン画面が初期表示される時, the Mosaku App Shell shall 未テーマの白い面が一瞬見えるちらつき（FOUC）なしにテーマ済みの面を描画する
4. The Mosaku Theme System shall メモ編集の本文面（`.memo-title` / `.memo-content`）と、それを取り巻くシェル面（ツールバー・タグ選択・保存インジケーター等）の世界観を連続させ、本文とシェルの境目で世界が断絶しないようにする

### Requirement 3: モーダル・オーバーレイの没入（G1 modal/overlay）

**Objective:** As a Mosaku ユーザー, I want ダイアログ・ドロップダウン・トースト等のオーバーレイも森の世界の一部として現れてほしい, so that 世界の手前に白い既製品パネルが浮いて没入が壊れない

#### Acceptance Criteria

1. When 森テーマ有効時にモーダル／ダイアログ／ドロップダウン／トースト等のオーバーレイが開いた時, the Mosaku App Shell shall そのパネル面をテーマ surface／primitive で描画する
2. The Mosaku App Shell shall オーバーレイ背後のスクリム（バックドロップ）を、生きた世界と調和しつつ前景パネルの可読性を保つ濃度で提示する
3. While オーバーレイが開いている状態で, the Mosaku App Shell shall パネル内のテキスト・ボタン・入力要素のコントラストを WCAG AA 以上に保つ
4. The Mosaku App Shell shall オーバーレイの開閉・フォーカストラップ・閉じる操作などの既存挙動を破壊しない

### Requirement 4: 公開ビューの世界連続（G1 public）

**Objective:** As a 公開メモを受け取った閲覧者, I want 共有された公開ページも、そのメモ／ノートブックが属する世界観で表示されてほしい, so that 送り主の「世界」ごと受け取れて、白い素のページで台無しにならない

#### Acceptance Criteria

1. When 認証なしの閲覧者が公開メモページを開いた時, the Mosaku App Shell shall そのコンテンツ（メモ／ノートブック）に紐づくテーマの世界観で公開ビューを描画する
2. The Mosaku App Shell shall 公開ビューのシェル面（ヘッダー・コンテナ・フッター等）を生リテラルではなくトークン／primitive 経由で彩色する
3. Where 公開コンテンツにテーマが紐づかない場合, the Mosaku App Shell shall 中立既定（現行の見た目）でフォールバックし、視認性を損なわない
4. The Mosaku Theme System shall 公開ビューでも編集ビューと同一のエディタ拡張ファクトリ由来の本文スタイルを用い、編集時と公開時で本文の世界観に差異を生まない

### Requirement 5: 三役タイポグラフィの確立と全域適用（G2）

**Objective:** As a Mosaku ユーザー, I want 見出しは游明朝の署名タイポ、ラベルやデータ値は monospace、本文は可読な地の文、という役割分担された字組みが全画面で効いてほしい, so that Artifact のような「編集された誌面」の質感になり、単なる色替えを超えた作り込みを感じられる

三役の定義: (1) **署名見出し（display）**＝游明朝 serif、(2) **ラベル／データ（mono）**＝monospace、(3) **本文（body）**＝可読な地の文。

#### Acceptance Criteria

1. The Mosaku Theme System shall タイポグラフィの役割を「見出し／署名（display）」「ラベル／データ（mono）」「本文（body）」の三役に分けたセマンティックトークン（例: `--shell-font-display` / `--shell-font-mono` / `--shell-font-body`）として定義する
2. When 森テーマが適用された時, the Mosaku App Shell shall 見出し・タイトルに游明朝の署名タイポ（display 役）を適用する
3. When 森テーマが適用された時, the Mosaku App Shell shall ラベル・メタデータ・数値／日時・キー名などの「データ」表示に monospace（mono 役）を適用する
4. The Mosaku App Shell shall 三役タイポを memo編集・tag・notebook・settings・public・modal を含むアプリ全域へ一貫して適用する
5. While `data-theme` が未設定（中立既定）の状態で, the Mosaku Theme System shall 三役タイポを現行のシステムフォント基調へフォールバックし、本スペック実装前の見た目を保つ
6. The Mosaku App Shell shall 三役タイポ適用後も本文・ラベルの可読性（サイズ・行間・コントラスト）を後退させない

### Requirement 6: 編集的構造装置 primitive の追加（G3）

**Objective:** As a Mosaku ユーザー, I want アイブロー（見出し上の小見出し）・状態ピル・番号付きセクションといった「編集された誌面」の構造装置が使えてほしい, so that 参照 Artifact 相当の作り込まれた情報設計の質感が全域で再現される

#### Acceptance Criteria

1. The Mosaku Theme System shall `primitives.css` に編集的構造装置のクラス（`.shell-eyebrow`＝見出し上のアイブロー／`.shell-chip`＝状態ピル／番号付きセクション）を theme-neutral な構造クラスとして追加する
2. The Mosaku Theme System shall これら構造装置の彩色・字組みを生リテラルではなく既存トークン（accent / on-surface-variant / mono 役タイポ等）経由で解決する
3. When 状態（下書き／保存済み／エラー等）を示す必要がある時, the Mosaku App Shell shall `.shell-chip` を用いて状態を背景と区別可能なコントラストのピルで提示する
4. While `data-theme` が未設定（中立既定）の状態で, the Mosaku Theme System shall これら構造装置を破綻なく（現行の見た目を壊さず）描画する
5. Where 海・夜・朝のテーマが後続スペックで値を与える場合, the Mosaku Theme System shall これら構造装置がテーマ固有値の差し替えだけで相乗りできる theme-neutral 構造を保つ

### Requirement 7: 可読性・コントラスト AA とロールバック回避の継承（品質保証）

**Objective:** As a Mosaku ユーザー, I want カバレッジ拡張後も全ての新規面で文字・アイコンがはっきり読める, so that 没入の拡大が実用性（読めること）を犠牲にしない

#### Acceptance Criteria

1. While 森テーマが各ドメイン面に適用された状態で, the Mosaku App Shell shall 全ての面のテキストと背景のコントラスト比を WCAG AA（本文 4.5:1 以上・大きな文字 3:1 以上）以上に保つ
2. The Mosaku App Shell shall 半透明 surface 上のテキストについて、生きた背景（`MoriEffectLayer`）の最明値が透けてもコントラスト下限を割らない設計（先行スペックの white 床 worst-case 合成検証の考え方）を新規面にも適用する
3. When フォーカス・選択・ホバー・無効・エラーなどの状態を表示する時, the Mosaku App Shell shall それらを背景と区別可能なコントラストで提示する
4. Where 自動テストでコントラストや primitive 契約を検証できる箇所がある場合, the Mosaku Theme System shall 主要な surface×on-surface ペアおよび新規 primitive のコントラスト／禁止セレクタ（要素型セレクタ不使用）をテストで担保する

### Requirement 8: 非干渉・軽量・データ不変と非対象の明示（制約遵守）

**Objective:** As a Mosaku ユーザー兼開発者, I want カバレッジ拡張・三役タイポ・構造装置が他テーマ・既存機能・バンドル軽量性を損なわず、かつ後続スペック領域に踏み込まない形で実現される, so that 軽量メモアプリの品質と段階的開発の秩序が守られる

#### Acceptance Criteria

1. When ユーザーが森以外のテーマ（海・夜・朝）または未設定状態でアプリを使う時, the Mosaku Theme System shall 本スペック実装前と同一の視覚的結果をレンダリングする（中立既定＝今日の見た目）
2. The Mosaku Theme System shall 外部 JS ライブラリを新規追加せず、CSS 変数・`.shell-*` primitive・既存フックのみでカバレッジ拡張・三役タイポ・構造装置を実現する
3. The Mosaku Theme System shall テーマの実体を CSS 本体＋メタデータのままとし、DB スキーマを変更しない。ただし公開ビュー没入（Requirement 4.1）の達成に必要な範囲で、スキーマに既存する非機密のテーマ識別子（slug／`cssFilePath`）を公開読み取りレスポンス DTO へ露出する最小限のバックエンド変更のみを許容する（gap-analysis §4.1 option (a) の決定）。この露出は公開エンドポイントの isolation invariant を割らない範囲に限る
4. The Mosaku Theme System shall 旧 `.theme-root` 系統の一本化（G4）および海・夜・朝の値実装・全体没入（G5）を本スペックの対象外とし、後続スペックに委ねる（受け皿は theme-neutral 構造として保つ）
5. While 森以外のテーマが選択されている状態で, the Mosaku Theme System shall 森専用の重量リソース（Layer③ のリッチテクスチャ等）を読み込まず、非森ユーザーの初期バンドルを本スペック実装前から増加させない
6. The Mosaku App Shell shall カバレッジ拡張が既存の認証フロー・メモ編集ロジック・自動保存・ゴミ箱などの機能に副作用を与えないことを保証する
