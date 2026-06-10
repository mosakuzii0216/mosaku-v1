# Implementation Plan

- [x] 1. バックエンド - DashboardModule の実装
- [x] 1.1 (P) DashboardService の集計クエリ実装
  - ゴミ箱対象外メモ（trashedAt IS NULL）のみを対象に、直近5件メモ取得・今週メモ件数集計・指定期間内の書いた日取得・ノートブック別メモ件数集計の4クエリを実装する
  - 全クエリに userId フィルタを含め、他ユーザーのデータが混入しないことを保証する
  - 週の境界計算を JST（UTC+9）固定で行い、月曜0時〜日曜24時の範囲で件数を算出する
  - 直近メモの本文プレビューは先頭100文字、活動日付は JST 換算した YYYY-MM-DD 形式で重複排除・昇順で返す
  - バックエンドとフロントエンドは完全に独立しているため、Task 2・3 と並行して進められる
  - _Requirements: 3.4, 4.3, 5.2, 5.4, 6.3_

- [x] 1.2 DashboardController の 4 集計エンドポイント実装
  - `/dashboard/recent-memos`・`/dashboard/weekly-count`・`/dashboard/activity-dates`・`/dashboard/notebooks` の4エンドポイントを実装し、DashboardModule を AppModule に登録する
  - `activity-dates` の `from`/`to` クエリパラメータを YYYY-MM-DD 形式で検証し、不正値に 400 を返す
  - グローバル JWT Guard による認証保護のみとし、`@Public()` を付与しない（401 は既存機構に委譲）
  - Sentry の `feature_area` enum に `'dashboard'` を追加する
  - _Requirements: 3.4, 4.3, 5.2, 6.3_

- [x] 2. フロントエンド - React Query フックの実装
- [x] 2.1 (P) queryKeys.dashboard への集計クエリキーの追加
  - `queryKeys` 定数に `dashboard` 名前空間を追加し、`recentMemos()`・`weeklyCount()`・`activityDates(from, to)`・`notebooks()` の4キーファクトリを定義する
  - Task 1・3 と並行して進められる（変更ファイルは queryKeys.ts のみ）
  - _Requirements: 3.4, 4.3, 5.2, 6.3_

- [x] 2.2 useHomeDashboardQueries フックの実装
  - `useRecentMemos`・`useWeeklyMemoCount`・`useActivityDates`・`useHomeDashboardNotebooks` の4フックを実装し、各フックは独立して `isLoading`・`isError`・`data` を返す
  - staleTime を5分（既存 ENTITY_CACHE_CONFIG に準拠）に設定し、サーバーデータを Zustand にコピーしない
  - `useActivityDates` は `from`/`to` を引数に取り、呼び出しコンポーネント側が直近35日分を計算して渡す想定とする
  - _Requirements: 3.4, 4.3, 5.2, 6.3_

- [x] 3. フロントエンド - ビューストア拡張とレイアウトルーティング
- [x] 3.1 (P) useViewStore の 'home' 対応拡張と初期状態変更
  - `ObjectType` 型に `'home'` を追加し、`goToHome()` アクション（currentObject: 'home'・currentView: 'list'・isEditing: false にリセット）を実装する
  - アプリの初期状態を `currentObject: 'home'` に変更し、起動時にホーム画面が最初に表示されるようにする
  - Task 1・2 と並行して進められる（変更ファイルは useViewStore.ts と ObjectType 型定義のみ）
  - _Requirements: 1.1_

- [x] 3.2 DesktopLayout と MobileLayout へのホーム画面ルーティング追加
  - `DesktopLayout`・`MobileLayout` それぞれの `renderMainContent()` switch 文に `case 'home'` を追加し、HomeDashboard コンポーネントをレンダリングする
  - デスクトップ・モバイル両レイアウトで正しく表示されることを確認する
  - _Requirements: 1.1, 1.3_

- [x] 4. フロントエンド - ホームセクションコンポーネントの実装
- [x] 4.1 (P) NewMemoHero コンポーネントの実装
  - 「新しいメモを書く」ボタンを画面最上部に配置し、テーマの `--primary-color` CSS 変数で他の要素より視覚的に強調したスタイルを適用する
  - タップ/クリック時に新規メモ作成画面へ即座に遷移する
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 4.2 (P) RecentMemosSection と RecentMemoCard コンポーネントの実装
  - `useRecentMemos()` フックを使用し、直近5件のメモを横スクロール可能なカード形式で表示する
  - 各カードにタイトルまたは本文冒頭テキストと最終更新日時を表示し、タップ時に該当メモの編集画面へ遷移する
  - ローディング中はスケルトンカード（幅固定の灰色矩形）を3枚表示し、エラー時はセクション内にエラーメッセージと再試行ボタンを表示する
  - 0件時は空状態メッセージと新規メモ作成への誘導リンクを表示する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4.3 (P) WeeklyActivitySummary コンポーネントの実装
  - `useWeeklyMemoCount()` フックを使用し、「今週 N個 書いたよ」形式の文言で今週のメモ件数を表示する
  - ローディング中はテキストスケルトンを表示し、エラー時はセクション内にエラーメッセージと再試行ボタンを表示する
  - 0件時は強制感・プレッシャーを与えない文言（例: 「今週はまだ書いていないよ」）を使用する
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4.4 (P) ActivityCalendar コンポーネントの実装
  - マウント時に直近35日（当日 - 34日〜当日）を `from`/`to` として計算し、`useActivityDates(from, to)` フックを呼び出す
  - 7列×5行の CSS Grid で週グリッドを実装し、アクティブ日に灰色系の単色ドット（小円）を表示する
  - 炎アイコン・連続日数カウンター・色による強調表現を使用しない中立的なデザインで実装する
  - ローディング中はグリッドスケルトン、エラー時はセクション内エラー表示を行う
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 4.5 (P) HomeNotebookSection コンポーネントの実装
  - `useHomeDashboardNotebooks()` フックを使用し、ノートブック名とメモ件数を一覧表示する
  - 各項目タップ時に対応ノートブックのメモ一覧画面へ遷移する
  - 0件時は「ノートブックがありません」メッセージとノートブック作成への誘導を表示する
  - ローディング中はスケルトン、エラー時はセクション内にエラーメッセージと再試行ボタンを表示する
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 4.6 (P) DailyPrompt コンポーネントと今日のお題定数の実装
  - 静的なお題テキスト配列を定義し、日付シード（YYYY-MM-DD の数値ハッシュ）で1件選択する仕組みを実装する
  - お題を画面下部に他のセクションより小さいサイズで表示し、タップ時にお題テキストを初期入力に含んだ新規メモ作成画面へ遷移する
  - 配列が空または選択が undefined の場合はコンポーネント全体を非表示にし（null 返し）、他のセクションに影響を与えない
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 5. HomeDashboard コンテナコンポーネントと画面統合
  - Tasks 4.1〜4.6 で実装した全セクションコンポーネントをスクロール可能な縦積みレイアウトで組み合わせ、各セクションが独立してローディング・エラー表示することを確認する
  - Tasks 3.1・3.2 で追加したビューストアとレイアウトルーティングと組み合わせ、起動時にホーム画面が正しく表示されることをアプリ全体として検証する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 6. テストの実装
- [x] 6.1 (P) DashboardService ユニットテストの実装
  - `getRecentMemos` の件数制限・`trashedAt` 除外・降順ソートを検証する
  - `getWeeklyMemoCount` の JST 週境界（月曜0時〜日曜23:59）・0件ケースを検証する
  - `getActivityDates` の `createdAt`/`updatedAt` 両方からの日付抽出・重複排除・昇順を検証する
  - `getNotebooksWithMemoCount` の `trashedAt IS NULL` メモのみカウントを検証する
  - _Requirements: 3.4, 4.3, 5.2, 5.4, 6.3_

- [x] 6.2 (P) DashboardController 統合テストの実装
  - `GET /dashboard/recent-memos` の認証なし(401)・認証あり(200)・他ユーザーのメモ混入なしを検証する
  - `GET /dashboard/weekly-count` の今週外メモが件数に含まれないことを検証する
  - `GET /dashboard/activity-dates` の `from`/`to` バリデーション(400)・範囲内の日付のみ返却を検証する
  - _Requirements: 3.4, 4.3, 5.2, 6.3_

- [x] 6.3 useHomeDashboardQueries フックのモックテスト（オプション）
  - 各フックが正しい API エンドポイントを呼び出すことをモックで確認する
  - `useRecentMemos`・`useWeeklyMemoCount`・`useActivityDates`・`useHomeDashboardNotebooks` それぞれの正しい apiClient 呼び出しを検証する
  - _Requirements: 3.4, 4.3, 5.2, 6.3_
