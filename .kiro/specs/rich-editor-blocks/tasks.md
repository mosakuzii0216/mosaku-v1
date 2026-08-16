# Implementation Plan — rich-editor-blocks

> **進め方**: 各サブタスクは cc-sdd の TDD（RED → GREEN → REFACTOR）で実装し、1 Todo = 1 Commit で刻む。`/kiro:spec-impl rich-editor-blocks <番号>` で個別実行し、タスク間はコンテキストをクリアする。
>
> **並行トラック**: `(P)` 付きタスクは並行実行可。エディタ TS 系（単一情報源 `createEditorExtensions.ts` を共有）と、パレット/AA（CSS・テスト）系・バックエンドテスト系は別境界・別ファイルのため並行できる。単一情報源へ登録する機能タスク（3〜6）どうしは同一ファイルを触るため直列扱いとし `(P)` を付けない。
>
> **リスクゲート**: Task 1.2 は research R2（Details の `editable:false` 開閉）を最優先 spike で確定するゲート。ここでトグル方式の分岐（既定 persist=false／不成立時の待避契約）を固定してから後続トグル・公開ビュータスクへ進む。

- [x] 1. エディタ拡張の依存調達とトグル公開開閉の最優先検証
- [x] 1.1 TipTap 公式拡張の調達と ProseMirror 基盤の直接依存化
  - `@tiptap/extension-table` / `-text-style` / `-highlight` / `-details` を既存規約どおり `3.22.2` にピン留めで追加する
  - `@tiptap/pm` を推移依存から直接依存へ昇格し、core `3.23.4` との dedupe・peer 互換を確認する
    - 実装時判明: `@tiptap/core@3.23.4` の peerDependency は `@tiptap/pm` の**厳密同一バージョン**を要求する（caret ではない）。新規4拡張追加後の cold resolve は `@tiptap/core` を最新 `3.27.3` へ動かそうとし、`@tiptap/pm` を額面通り `3.22.2` に固定すると ERESOLVE で衝突する。→ `@tiptap/pm` は実際にツリー全体がデデュープする `3.23.4` にピン留めし、加えて root/`frontend` 両 `package.json` に `overrides: { "@tiptap/core": "3.23.4", "@tiptap/pm": "3.23.4" }` を追加してツリー全体を単一バージョンへ強制固定した（cold resolve でも安定して dedupe することを隔離ディレクトリでの `npm ci` 再現検証で確認済み）
  - Docker dev 利用時はコンテナ内で install を実行し、lock ファイルの副作用は戻す
    - `frontend/package-lock.json`（Docker ビルド専用のスタンドアロンロックファイル）は既存コミットから長期未更新で乖離していたため、隔離ディレクトリでの cold resolve で再生成した。root `package-lock.json`（workspace 用）も再インストールで更新。両ロックファイルとも `npm ci` 相当の検証を通過。`docker exec mosaku-frontend npm ci` でコンテナ側 node_modules も同期し、dev サーバー再起動で反映を確認
  - _Requirements: 2.5, 3.1, 4.1_

- [x] 1.2 トグル開閉が公開ビュー（editable:false）で成立することを spike で確定
  - Details を `persist:false` で単一情報源へ仮登録し、公開ビューから `pointer-events-none` を除去して editable:false 下の開閉が view-state で動くことを実機・ユニットで検証する
  - 成立時はこの方式を確定。不成立時のみ待避契約（`persist:true` ＋ open 属性限定の `filterTransaction` ゲートを公開ビューに導入）へ一本化する。native `<details>` 描画案は往復一致を崩すため採らない
  - 公開ビューで許可する操作をトグル開閉・リンク遷移・テキスト選択の3操作に限定し、既存 `pointer-events-none` 固定テストを editable:false ベースの挙動テスト（本文編集・TaskItem チェックボックス等の編集系は拒否）へ置換する
  - 分岐結果を後続トグル（Task 6）・往復一致（Task 9）の前提として固定する
  - **spike 結論: persist:false 方式で成立を確定。**実 Editor（`detailsPublicToggle.spike.test.ts`）でトグルボタンの実クリックが `editable:false` 下でも view-state（CSS class `is-open` の付け外し・`detailsContent` の `hidden` 属性）のみで開閉し、`open` 属性がスキーマに存在しないため doc へトランザクションを書き込まないことを確認。TaskItem チェックボックスも `editor.isEditable` チェックで読み取り専用時は視覚状態が自動的に戻ることを確認（拡張側の追加実装不要）
  - **spike で発見した副作用と対処**: StarterKit 標準 `TrailingNode` は `editable` を判定せず、doc 末尾が非デフォルト型ノード（`details` 等）のときトランザクション発行のたびに末尾へ空段落を自動挿入する。Details のトグルクリックは persist:false 時に内部で無条件に `editor.commands.focus()` を呼ぶため、これが引き金となり公開ビューでもトグル開閉クリックだけで doc 構造が変わってしまうことが実 Editor テストで判明（Req6.4 違反）。読み取り専用ビューに「末尾の先へ入力する」UX 自体が不要なため、`createEditorExtensions.ts` の StarterKit 設定へ `trailingNode: editable ? undefined : false` を追加して editable:false 時のみ無効化し解消した。他ノード（table/callout 等、Task 4/5 で追加予定）が doc 末尾に来た場合も同じ経路で波及するため、後続タスクでの回帰確認は不要（すでにこの対処で editable 非依存に閉じている）
  - `PublicMemoRenderer.tsx` から `pointer-events-none` を除去（`select-text` は維持）。既存固定テストは `PublicMemoRenderer.test.tsx` で「pointer-events-none を持たない」「select-text を維持する」の2テストへ置換
  - _Requirements: 4.4, 4.5, 6.4, 9.3_

- [x] 2. セマンティックパレットと AA 機械検証（テスト先行）
- [x] 2.1 (P) AA コントラスト検証ユーティリティの共有化
  - `tokens.contrast.test.ts` にインライン定義された WCAG 計算群（parseColor / compositeOver / relativeLuminance / contrastRatio / findBlock / extractVar）を共有ユーティリティへ抽出し、既存テストを import 参照へ切り替える（重複排除・非回帰）
  - 計算ユーティリティの既知値セルフテストを維持する
  - パレット/AA 系は Task 1・3〜6 のエディタ実装と別境界・別ファイルのため並行して着手できる
  - _Requirements: 2.10_

- [x] 2.2 editor セマンティックパレットの AA 機械検証テストを追加（RED 先行）
  - `:root` 中立既定＋各 `public/themes/*/*.css` の `.theme-root` × 全セマンティック色（テキスト色・マーカー・コールアウト）で AA(4.5:1) を検証するテストを追加する
  - テキスト色はテーマ本文グラデ背景の両端合成、マーカー/コールアウトは不透明背景×文字で検証する
  - テキスト色・マーカーが全テーマで各種4色以上 AA を満たすことを件数で固定し、AA 不成立による色除外での下限割れを検出する
  - 前段 Task 2.1 の共有ユーティリティに依存する
  - _Requirements: 2.3, 2.7, 2.8, 2.10_

- [x] 2.3 セマンティックカラー CSS 変数の実装（GREEN）
  - 中立既定パレット（`--editor-text-*` / `--editor-marker-*(-on)` / `--editor-callout-*(-bg/-on)`）を `tokens.css` の `:root` に定義し、公開ビュー主経路とフォールバックを兼ねさせる
  - 各テーマ（mori / umi / yoru / asa）の memo 面 CSS `.theme-root` にテーマ別実値を定義する
  - Task 2.2 の AA テストが GREEN になるまで色値を調整し、テキスト色・マーカー各4色以上を必ず確保する（AA 不成立による色除外で4色未満を許容しない）
  - 命名は Mosaku の世界観に沿う和名（design のセマンティック名）を用い、未知 name はフォールバックで描画する
  - _Requirements: 1.7, 2.3, 2.6, 2.7, 2.8, 2.9, 6.5_

- [x] 3. テキスト色・マーカー（セマンティックマーク2種）
- [x] 3.1 テキスト色マーク（TextStyle 拡張）の実装
  - TextStyle を extend してセマンティック名のみを属性に保持し、`data-text-color` を出力・復元する（生 hex の `style="color:…"` を出力/保存しない）
  - 選択範囲へ色を適用するコマンドと、既定へ戻す除去コマンドを提供する
  - TextStyle と本マークを単一情報源へ登録する（公式 Color / BackgroundColor サブ拡張は登録しない）
  - ユニットテスト: 適用後 JSON にセマンティック名のみが残り hex が混入しない・除去で既定へ戻る
  - _Requirements: 2.1, 2.4, 2.5, 2.6, 6.1_

- [x] 3.2 マーカーマーク（Highlight 拡張）の実装
  - Highlight を extend して multicolor の hex 属性をセマンティック名の属性へ置換し、`<mark data-marker=…>` を出力・復元する
  - 選択範囲へマーカーを適用するコマンドと、既定へ戻す除去コマンドを提供する
  - 本マークを単一情報源へ登録し、テキスト色・既存装飾（太字等）と同一 text ノード上で複数 mark として共存できることを担保する
  - ユニットテスト: 適用後 JSON にセマンティック名のみが残り hex が混入しない・除去で既定へ戻る
  - _Requirements: 2.2, 2.4, 2.5, 2.6, 6.1_

- [x] 4. コールアウトブロック（カスタムノード + NodeView）
- [x] 4.1 コールアウトノードの定義と単一情報源への登録
  - `group:'block'` / `content:'block+'` / `defining:true` ＋ `variant`（enum, 既定 point）属性のスキーマを定義し、アイコン/ラベル等の表示テキストを属性に持たせない
  - `data-callout` / `data-variant` 属性で renderHTML・parseHTML を実装し、公開/再読込で同一描画になるようにする
  - 未知 variant は既定へフォールバックして描画する（前方互換）
  - 単一情報源へ editable 非依存で登録する
  - _Requirements: 1.1, 1.2, 6.1_

- [x] 4.2 コールアウト NodeView（種別変更・脱出・削除）
  - ReactNodeView で本文（複数段落・インライン装飾可）を保持しつつ、種別変更で本文を保ったままアイコン/配色のみ切り替える UI を提供する
  - StarterKit 同梱 Gapcursor ＋文末での ArrowDown / Mod-Enter 脱出 keymap を追加し、キャレットがブロック内へ閉じ込められないようにする
  - 本文ごとコールアウトを削除する手段を提供する
  - ユニットテスト: 種別変更で本文保持・脱出 keymap でキャレットが外へ出る
  - _Requirements: 1.3, 1.4, 1.5, 1.6_

- [x] 5. 表（TableKit）の挿入・編集・セル移動と横スクロール
  - `TableKit.configure({ table: { resizable: false } })` を単一情報源へ登録し、ヘッダー行付きの複数行×複数列の表をカーソル位置に挿入できるようにする
  - セル内のテキスト入力・編集とインライン装飾（太字・テキスト色/マーカー等）を許可する
  - Tab / Shift+Tab による次/前セルへのキャレット移動を TableKit 標準挙動で有効化する
  - `.tableWrapper` に `overflow-x:auto` を編集面・公開面の両スコープへ付与し、表示領域超過時もレイアウトを崩さず全列へアクセスできるようにする
  - 行/列の追加・削除および表全体削除の操作導線は Task 8 のバブルメニューで提供する
  - **実装時判明**: `resizable:false`（既定）では列リサイズ用 NodeView（`columnResizing` プラグイン経由の `TableView`）が一切装着されない。TableKit 内の `Table` ノードは `addNodeView` を持たず、NodeView は `resizable && editable` のときのみ ProseMirror プラグインとして追加される実装のため、`resizable:false` 単体では `renderWrapper`（既定 `false`）により `.tableWrapper` の div が一切出力されない。→ `TableKit.configure({ table: { resizable: false, renderWrapper: true } })` とし、`renderHTML` が editable に依らず常に `.tableWrapper` で表を包むようにして Req3.6 の横スクロールの前提（編集/公開で同一 DOM 構造）を担保した
  - `table.css` を新規作成し `.rich-text-editor .tableWrapper` / `.public-memo-renderer .tableWrapper` へ `overflow-x:auto` を付与、`createEditorExtensions.ts` から import して単一情報源に閉じた
  - _Requirements: 3.1, 3.2, 3.5, 3.6, 6.1_

- [x] 6. トグル（Details）の挿入とサマリー/本文の編集
  - Task 1.2 で確定した persist 方式（既定 persist=false、不成立時は待避契約）で Details を単一情報源へ本登録する
  - スラッシュ確定時に開いた状態でトグルを挿入する
  - サマリー行（inline）のテキスト編集と、本文領域（block+）への複数ブロック（段落・リスト等）の配置を許可する
  - 開閉操作で本文領域の表示/非表示を切り替え、閉じているときはサマリー行のみを表示する（本文ノードは開閉に依らず常に doc content に存在させる）
  - **実装時判明**: persist:false のため「開いた状態」は doc 属性ではなく NodeView の view-state（`is-open` クラス・`detailsContent` の `hidden` 属性）のみで表現される。公式 `setDetails` コマンドは常に「閉」で挿入するため、`./Details.ts`（`@tiptap/extension-details` の `Details` を extend）に `insertOpenDetails` コマンドを追加し、挿入直後にトグルボタンをプログラム的にクリックして view-state を開状態へ揃えた。挿入は `editor.commands.setDetails()` を即時 dispatch で呼ぶことで view の再描画（NodeView DOM 生成）を同期的に確定させてからボタンを探索・クリックする方式とし、outer トランザクションとの二重 dispatch 衝突（`Applying a mismatched transaction`）は `tr.setMeta('preventDispatch', true)` で回避した。この実装上の制約により `insertOpenDetails` は単体呼び出し専用（より大きな `chain()` に連結すると他コマンド分の変更が揉み消される）
  - サマリー/本文の編集許可・本文の複数ブロック配置・開閉時の本文常在（Req7.4 の検索抽出前提）は公式スキーマ（`detailsSummary: content 'text*'` / `detailsContent: content 'block+'`）がそのまま満たすため追加実装不要。ユニットテストで固定
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1_

- [x] 7. スラッシュコマンド統合
- [x] 7.1 スラッシュコマンドへの5項目追加
  - 「コールアウト」「表」「トグル」を挿入コマンドとして追加する（コールアウト/トグルは開いた状態・表はヘッダー行付き）
  - 「テキスト色」「マーカー」は doc を変更せず palette モードへ遷移するトリガーとして追加する（run は no-op、遷移は render 層）
  - 各項目に日本語名・英語別名・読みの keywords を付与し、確定時に `/` とクエリ文字列を削除する（Undo は ProseMirror history が提供）
  - 既存のブロック挿入9コマンドとノートブック参照の挙動を変更しない
  - **実装時判明**: `insertOpenDetails`（Task 6・`Details.ts`）は `editor.commands.setDetails()` を即時 dispatch する単体呼び出し専用コマンドのため `editor.chain().deleteRange(range).insertOpenDetails()` のようにチェーン連結すると range 削除が握り潰される。そのため「トグル」項目の `run` は `editor.chain().focus().deleteRange(range).run()` → `editor.commands.insertOpenDetails()` の2回の独立 dispatch に分けた。ProseMirror history の既定グループ化（`newGroupDelay`）により連続する dispatch は1回の Undo にまとまることを実 Editor で検証済み（Req5.5 は維持）
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [x] 7.2 色サブメニュー（palette モード）の実装
  - スラッシュのモードに `palette` を追加し、セマンティック色スウォッチを列挙する（既存 notebook サブメニューと同型・doc にモードを持たせない）
  - 確定でクエリ範囲を削除し stored mark を有効化して、以降入力するテキストへ色/マーカーを適用する
  - 「戻る」/ Escape / クエリ空で root モードへ復帰する
  - 前段 Task 3（セマンティックマーク）に依存する
  - **実装時判明**: `SemanticTextColor`/`SemanticMarker` が内部で使う `@tiptap/core` の `setMark` コマンドは、選択が空（deleteRange 後のカーソルのみ）のとき自動的に `tr.addStoredMark()`（以降入力するテキストへのみ適用される保留マーク）を使う実装のため、palette 確定の `run` は特別な分岐なく `deleteRange(range).setTextColor(name)`/`setMarker(name)` を単一チェーンで呼ぶだけで Req5.3 の「以降の入力テキストへ適用」を満たす。`suggestion.ts` の `ReactRenderer` はスタンドアロン Editor（`EditorContent` 未マウント）では `contentComponent` 不在のため実際には DOM 描画されない制約があり、`EditorContent` 経由でマウントした最小ハーネス＋`editor.commands.insertContent('/')`（実キー入力の jsdom シミュレーションは ProseMirror の contentEditable 処理を再現できないため代替）で `suggestion.test.tsx` として統合テストを追加した
  - _Requirements: 5.3_

- [x] 8. バブルメニュー（選択範囲への色適用と文脈操作）
  - 既存 `@tiptap/react` のメニュー機構で選択時バブルメニューを実装し、`editable=true` の編集面にのみマウントする（公開ビューには載せない・新規 JS ライブラリを追加しない）
  - テキスト選択時: セマンティック色/マーカーのスウォッチと「デフォルトに戻す」を表示し、選択範囲へ適用/除去を実行する
  - キャレットが表内: 行の追加/削除・列の追加/削除・表全体削除を提示する
  - キャレットがコールアウト内: 種別変更を補助表示する（NodeView 内蔵と併存）
  - `editor.can()` で不能コマンドを無効化し、doc に UI 状態を持たせない（表示は選択/キャレット文脈から純粋導出）
  - 前段 Task 3（マーク）・5（表）・4（コールアウト）に依存する
  - **実装時判明**: `@tiptap/react/menus` の `BubbleMenu` は `@tiptap/extension-bubble-menu`/`-floating-menu`（`@floating-ui/dom` 経由）を内部依存として使うが、いずれも `@tiptap/react` の既存 peer 経由で node_modules に解決済みのため `package.json` への新規追加は不要だった（設計の「新規 JS ライブラリ追加なし」を維持）
  - `shouldShow` を「選択が非空、または `editor.isActive('table')`/`editor.isActive('callout')`」の純関数として実装し、doc/フォーカス状態に依存させず選択・キャレット文脈のみから表示可否を導出した
  - テキスト色/マーカーのスウォッチ一覧（`TEXT_COLOR_SWATCHES`/`MARKER_SWATCHES`）は Task 7.2（`slashCommandItems.ts` の palette モード）と本タスクの二重定義になっていたため `./semanticPalette.ts` へ抽出し、両ファイルが単一情報源を参照するようリファクタした
  - **実装時判明**: jsdom の `Range` は `getClientRects`/`getBoundingClientRect` を実装しないため、`BubbleMenu` の floating-ui 位置計算（ProseMirror `coordsAtPos` 経由）がテスト実行時に例外を投げる。`RichTextEditor` をマウントする既存テスト（`CalloutView.test.tsx` 等）にも波及するため、個別テストへスタブを書く代わりに `frontend/src/test/setup.ts` を新設し `vitest.config.ts` の `setupFiles` へ登録して一括解消した（本番コードには影響しない）
  - 「デフォルトに戻す」は `unsetTextColor()`＋`unsetMarker()` を1チェーンで実行し、テキスト色・マーカーの両方を既定へ戻す単一ボタンとした
  - ユニット/統合テスト（`EditorBubbleMenu.test.tsx`）: 選択なし・表/コールアウト外では非表示、テキスト選択時のスウォッチ表示・選択範囲への適用・「デフォルトに戻す」での除去、表内でのRow/Column/Table操作、コールアウト内での種別変更（本文保持）、`editable:false` では非表示、を固定
  - _Requirements: 2.1, 2.2, 2.4, 3.3, 3.4_

- [x] 9. 往復一致・検索抽出・オフライン・非回帰の担保テスト
- [x] 9.1 (P) 往復一致とマーク共存の統合テスト
  - `saveRoundTrip` 系を拡張し、4機能を含む複合 doc が 編集↔公開↔再読込 で構造等価に復元されることを固定する
  - テキスト色＋マーカー＋既存装飾（太字）を同一テキストへ同時適用した際の JSON 構造と復元を固定する
  - JSON にセマンティック名のみが現れ hex/rgb が混入しないこと、既存 TaskList・コードブロックの往復が非回帰であることを固定する
  - Task 1〜8 完了を前提とし、各サブタスクは別テストファイルのため相互に並行可
  - **実装時判明**: `saveRoundTrip.test.ts` へ callout/table/details＋textStyle/highlight/bold 複合の `RICH_DOC` を追加。既存の単一情報源（`createEditorExtensions`）実装のみで往復一致が成立し、プロダクションコード変更は不要だった。トグルは persist:false のため往復後も `details` ノードに `attrs` を持たず、`detailsContent` が常に content に残ることも合わせて固定
  - _Requirements: 2.5, 6.1, 6.2, 6.3_

- [x] 9.2 (P) 検索テキスト抽出の追随担保（フロントエンド/バックエンド）
  - フロントエンドとバックエンドのテキスト抽出が、コールアウト本文・表セル・トグルのサマリー/本文のテキストを平文抽出結果に含めることをテストで固定する
  - 閉じた状態で保存されたトグルの本文テキストも抽出対象に含まれることを固定する
  - テキスト色/マーカー適用済みテキストが通常テキストと同様に抽出されることを固定する
  - 表示テキストが必ずノード content に置かれ属性側に表示テキストを持たないこと（抽出漏れ回避）を固定する
  - **実装時判明**: `prosemirrorText.ts`（FE）/`prosemirror-text.ts`（BE）は既存の content 再帰実装のまま4機能ノードへ自動追随するため、両ファイルへ実装変更は不要でテスト追加のみで GREEN になった。「閉じたトグル」は persist:false のため doc に開閉状態を持たず、`detailsContent` が常に content に存在する doc 自体がその表現であることをテストコメントで明記
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 9.3 (P) オフライン層の追随担保
  - オフライン状態で4機能を含むメモを編集した際に本文 JSON が欠損なくローカル保存され、接続回復時に欠損なく同期されることを固定する
  - オフライン検索の対象テキストに4機能のノード内テキストが含まれることを固定する
  - オフライン保存されたメモの再表示で4機能が編集時と同一構造に復元されることを固定する
  - **実装時判明**: `repository.ts` は content を JSON パススルーで保存し、`searchableText` は呼び出し側が `extractPlainText`（Task 9.2 で4機能への追随を固定済み）で算出して渡す構造のため、リポジトリ実装は無改修。`applyOfflineEdit`/`markSynced`/`saveLocal`/`search` を対象に4機能入り doc でテストを追加した
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 9.4 (P) バックエンド受理・自動保存・既存非回帰の担保
  - 4機能のノード/マークを含む本文 JSON を既存の JSONB カラムと既存バリデーションの枠組みのまま受理・保存できることを固定する（DB スキーマ変更なし）
  - 4機能を含むメモの自動保存が既存メモと同一挙動（編集停止後の自動保存・保存状態インジケーター）で動作することを固定する
  - 4機能を含まない既存メモの表示・編集動作、および既存 Markdown input rules・ツールバー・ノートブック参照・チェックリストの挙動が不変であることを固定する
  - **実装時判明**: `IsProseMirrorDoc`/`isProseMirrorDoc` はノードタイプのホワイトリストを持たないため4機能ノードを無改修で受理する（回帰テストを `prosemirror-types.spec.ts`・`create-memo.dto.spec.ts`・`update-memo.dto.spec.ts` へ追加）。`memo.service.ts` の `create()`/`update()` も `contentText` を content 再帰で導出するのみで4機能へ自動追随するため無改修（`memo.service.spec.ts` へテスト追加）。フロントエンド `useAutoSave` フックは `onSave: () => Promise<...>` のシグネチャで content を一切引数に取らない構造（呼び出し元がクロージャで content を保持）のため、自動保存の debounce/インジケーター挙動はノード種別と構造的に無関係であり追加テスト不要と判断した。既存メモ・既存9コマンド・Markdown input rules・ツールバー・ノートブック参照・チェックリストの非回帰は、本タスクで新規テストを追加した上でフロントエンド全135スイート1347テスト・バックエンド全80スイート975テストを実行し、既存テストを含め全て green であることを確認して固定した
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
