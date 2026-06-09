# Implementation Plan

## Task Format Template

- [x] 1. `useViewStore` に表示モードの開閉状態を追加
  - 既存の `useViewStore` インターフェースに `isDisplayMode: boolean`（初期値 `false`）を追加する
  - `openDisplayMode()` で `isDisplayMode` を `true` にセット、`closeDisplayMode()` で `false` にセットするアクションを実装する
  - 既存の `useFeedbackStore` の `isOpen / open / close` パターンと同形で実装し、サーバーデータは一切 Zustand に保持しない
  - _Requirements: 1.1, 1.4_

- [x] 2. `FocusMemoOverlay` の全画面オーバーレイを構築
- [x] 2.1 フルスクリーンオーバーレイの基本構造を実装する
  - `createPortal` で `document.body` に直接マウントし、通常の DOM ツリーから独立させる
  - `position: fixed; inset: 0` でビューポート全体（100vw × 100vh）を覆うオーバーレイを作成する
  - コンテンツカラムは `max-width: 65ch` 程度で水平中央寄せ・縦スクロール可能なレイアウトにする
  - `z-index: 9999`（Tailwind: `z-[9999]`）でサイドバー・ツールバー等の通常 UI をすべて前面から遮蔽する
  - `isDisplayMode = false` のとき DOM から完全にアンマウントし、`isDisplayMode = true` のときのみレンダリングする
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 2.2 メモコンテンツのリードオンリー表示を実装する
  - `useMemoDataStore` から `selectedMemoId` を取得し、`useMemoQuery(selectedMemoId)` でキャッシュを参照する（追加 API コール禁止）
  - メモタイトルを本文より大きいフォントサイズで本文上部に表示する
  - 既存の `PublicMemoRenderer`（TipTap `editable: false`）でリッチテキストをリードオンリーレンダリングする
  - CSS カスタムプロパティ `--dm-font-size`（18px 以上）・`--dm-line-height`（1.8 以上）を定義し読みやすさを確保する
  - `select-text` クラスでテキスト選択・コピーを有効にする
  - _Requirements: 1.2, 2.3, 2.5, 3.1, 3.2, 3.3_

- [x] 2.3 空状態・ローディング・エラーガードを実装する
  - `useMemoQuery` の返り値が `undefined`（キャッシュ未確定・ローディング中）のとき「読み込み中...」メッセージを表示する
  - `selectedMemoId` が `null` のとき `closeDisplayMode()` を即時呼び出してオーバーレイを閉じるガード節を追加する
  - `memo.content` が空文字のとき `PublicMemoRenderer` の代わりに空状態を示すメッセージ（例:「まだ内容がありません」）を表示する
  - _Requirements: 3.4_

- [x] 2.4 テーマ CSS 変数の継承とスタイル定義を実装する
  - `useActiveTheme()` でアクティブテーマを取得し、オーバーレイルート要素に `data-theme-id` 属性を付与してテーマ CSS 変数（`--color-background`・`--color-text` 等）を継承させる
  - テーマ変数を上書きせず `var(--color-background)` 等で参照のみ行い、テーマ変更に自動追随する設計にする
  - `--dm-font-size`・`--dm-line-height` をテーマ側から上書き可能な CSS カスタムプロパティとして定義する
  - `ThemeEffectHost` は `DesktopLayout` / `MobileLayout` に継続して存在するため、表示モード中もテーマエフェクトは中断なく表示される（コード変更不要・動作確認のみ）
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 3. 表示モードの終了操作を実装する
- [x] 3.1 ESC キーと閉じるボタンによる終了を実装する
  - `useEffect` 内で `document.addEventListener('keydown', handler)` を登録し、ESC キー押下で `closeDisplayMode()` を呼ぶ（cleanup で必ず解除する）
  - オーバーレイ右上に `position: fixed` で常時表示される閉じるボタンを配置する
  - 閉じるボタンのクリックで `closeDisplayMode()` を呼ぶ
  - _Requirements: 4.1, 4.2, 4.4_

- [x] 3.2 背景クリックによる終了とスクロールロックを実装する
  - 背景 div の `onClick={closeDisplayMode}` でクリック終了を実装し、コンテンツ div では `stopPropagation()` して誤爆を防ぐ
  - マウント時に `document.body.style.overflow = 'hidden'` でバックグラウンドスクロールをロックし、アンマウント時に `document.body.style.overflow = ''` で復元する
  - _Requirements: 4.3_

- [x] 4. (P) `MemoEditor` に表示モード起動ボタンを統合する
  - `useViewStore` から `openDisplayMode` を参照し、`MemoEditor` のヘッダー内に起動ボタンを `<button>` として直接追加する（独立コンポーネント化不要）
  - `isCreate` が `true`（新規作成モード）のとき起動ボタンを非表示にする
  - 保存ボタンの左隣など視認しやすい位置に配置し、メモ詳細・編集画面の両方でアクセスできるようにする
  - `useViewStore`（Task 1）の完了が前提だが、`FocusMemoOverlay`（Task 2・3）とは別ファイル（MemoEditor.tsx）のため並列実行可能
  - _Requirements: 1.1, 1.3_

- [x] 5. ユニットテストと統合テストを実装する
- [x] 5.1 `useViewStore` の状態変化テストを実装する
  - `openDisplayMode()` 呼び出し後に `isDisplayMode` が `true` になること
  - `closeDisplayMode()` 呼び出し後に `isDisplayMode` が `false` になること
  - _Requirements: 1.1, 1.4_

- [x] 5.2 `FocusMemoOverlay` のレンダリングテストを実装する
  - `isDisplayMode = false` のとき DOM に要素が存在しないこと
  - `isDisplayMode = true` かつ有効な `selectedMemoId` があるとき、対応するメモのタイトルとコンテンツが表示されること
  - `memo.content` が空文字のとき空状態メッセージが表示されること
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [x] 5.3 統合テストを実装する（オプション）
  - `MemoEditor` の起動ボタンクリック後に `FocusMemoOverlay` がマウントされること
  - ESC キー押下・閉じるボタンクリック・背景クリックで `FocusMemoOverlay` がアンマウントされること
  - テーマ設定済み状態で表示モードを起動したとき、テーマカラーがオーバーレイに適用されること
  - _Requirements: 4.1, 4.2, 4.3_
