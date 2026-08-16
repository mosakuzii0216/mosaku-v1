# Implementation Plan

- [x] 1. (P) バックエンドフィードバックモジュールの実装
- [x] 1.1 フィードバック DTO とカテゴリ enum の作成
  - フィードバックカテゴリを `bug` / `improvement` / `other` の enum で定義する
  - メッセージに `@IsNotEmpty` と `@MaxLength(1000)` を適用してバックエンドバリデーションを確立する
  - カテゴリに `@IsEnum` を適用し、不正な値を拒否する
  - _Requirements: 2.3, 5.4_

- [x] 1.2 Slack Webhook 通知サービスの実装
  - `SLACK_FEEDBACK_WEBHOOK_URL` 環境変数を ConfigService から読み込み、空の場合は警告ログを出して Slack 送信をスキップし起動は継続する
  - カテゴリ別の絵文字・Attachment カラー設定テーブルを用意する（不具合: 🔴/#FF0000、改善要望: 🟡/#FFC107、その他: 🔵/#2196F3）
  - Slack Webhook に POST するペイロードを組み立て、フィールドにはカテゴリ・メッセージ・送信者名・メールアドレス・送信日時（JST）を含める
  - `fetch` を 5 秒タイムアウト（`AbortController`）で呼び出し、失敗時は `Sentry.captureException` に `{ tags: { feature_area: 'system' } }` を付与して記録し、例外を上位に伝播させない（Slack 障害でユーザー体験を損なわない設計）
  - 送信者情報（name, email）はコントローラーから受け取る。クライアントからは一切受け付けない
  - _Requirements: 3.2, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 1.3 フィードバックコントローラーとモジュールの実装
  - `POST /feedback` エンドポイントを定義し、グローバル JwtAuthGuard の保護下に置く（`@Public()` は付与しない）
  - `@Throttle({ default: { limit: 3, ttl: 60000 } })` を適用して 1 分間 3 回に送信回数を制限する
  - `req.user` から name と email を取り出して FeedbackService.submit() に渡す
  - `FeedbackModule` を作成し、`AppModule` に登録する
  - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.4_

- [x] 2. (P) フロントエンド状態管理と API 通信レイヤーの実装
- [x] 2.1 (P) フィードバックモーダル開閉状態ストアの実装
  - Zustand ストアに `isOpen: boolean`（デフォルト `false`）・`open()` ・`close()` を実装する
  - セッションのみの状態管理とし、永続化は行わない
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 2.2 (P) フィードバック送信 API 関数と React Query mutation の実装
  - `apiClient` に `POST /feedback` を呼び出す関数を追加する
  - `useMutation` を使って送信 mutation を実装し、`isSubmitting` を呼び出し元に公開する
  - 成功時に `onSuccess` コールバックを実行し、`ApiError.status === 429` を区別してレート制限エラーとして扱う
  - `queryClient.invalidateQueries` は不要（フィードバックにはキャッシュなし）
  - _Requirements: 3.1, 3.4, 3.5, 5.3_

- [x] 3. フィードバックモーダル UI コンポーネントの実装
- [x] 3.1 フォームレイアウトと入力 UI の実装
  - モーダルダイアログ構造（backdrop + dialog）を実装し、`isOpen` が `false` のときは `null` を返してアンマウントでフォームをリセットする
  - カテゴリ選択 UI（不具合 / 改善要望 / その他）を実装し、デフォルトを未選択状態にする
  - メッセージ入力テキストエリアと、現在の文字数 / 1000 をリアルタイムで表示するカウンターを実装する
  - ESC キー押下と backdrop クリックで `onClose()` を呼び出す
  - `useFeedbackStore` から `isOpen` と `close()` を受け取り、`useFeedbackQueries` と連携する
  - _Requirements: 1.3, 1.4, 1.5, 2.4_

- [x] 3.2 フロントエンドバリデーションとエラーハイライトの実装
  - 送信ボタンクリック時にカテゴリ未選択・メッセージ空・1000 文字超過を検出してエラーメッセージをフォームに表示する
  - エラーが発生した入力フィールドをハイライト表示し、エラー状態のままでも送信ボタンは有効を維持する
  - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [x] 3.3 送信処理・ローディング状態・成功/エラー表示の実装
  - `useFeedbackQueries.submitFeedback` を呼び出し、送信中は `isSubmitting` に基づいてボタンをローディング状態にして重複送信を防ぐ
  - 送信成功後に成功メッセージを表示し、`useFeedbackStore.close()` を呼び出してモーダルを自動クローズする
  - `ApiError.status === 429` のときはレート制限エラーメッセージ（「送信が多すぎます。しばらく待ってから再試行してください」）を表示する
  - _Requirements: 3.4, 3.5, 5.3_

- [x] 4. エントリポイントとアプリ統合
- [x] 4.1 (P) ヘッダーへのフィードバックボタン追加
  - 既存 `Header.tsx` のドロップダウンメニューにフィードバックボタンを追加し、クリックで `useFeedbackStore.open()` を呼び出す
  - _Requirements: 1.1_

- [x] 4.2 (P) 設定ページへのフィードバックセクション追加
  - 既存 `SettingsPage.tsx` にフィードバックセクションを追加し、ボタンクリックで `useFeedbackStore.open()` を呼び出す
  - _Requirements: 1.2_

- [x] 4.3 App.tsx への FeedbackModal マウントと動作確認
  - `App.tsx` に `FeedbackModal` をマウントし、`useFeedbackStore` の `isOpen` と `close` を渡す
  - ヘッダー・設定ページどちらから開いても正しく表示・クローズされることを手動確認する
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 5. テスト実装
- [x] 5.1 (P) バックエンドユニットテストの実装
  - `FeedbackService.submit()`: Slack 成功時に正しいペイロードで `fetch` が呼ばれることを確認する
  - `FeedbackService.submit()`: Slack 失敗時に `Sentry.captureException` が呼ばれ、例外が上位に伝播しないことを確認する
  - `FeedbackService.submit()`: Webhook URL が空の場合に `fetch` が呼ばれないことを確認する
  - `CreateFeedbackDto`: `category` 未指定・`message` 空・1001 文字でバリデーションエラーになることを確認する
  - _Requirements: 2.3, 4.1, 4.4, 5.4_

- [x] 5.2 (P) バックエンド統合テストの実装
  - `POST /feedback` への未認証リクエストが 401 を返すことを確認する
  - 有効な JWT + 正常ペイロードで 201 が返ることを確認する（Slack fetch をモック）
  - 無効なカテゴリで 400 が返ることを確認する
  - _Requirements: 3.1, 3.3, 5.1_

- [x] 5.3 (P) フロントエンドユニットテストの実装
  - `useFeedbackStore`: `open()` / `close()` で `isOpen` が正しく変化することを確認する
  - `FeedbackModal`: カテゴリ未選択で送信するとエラー表示され、送信 mutation が呼ばれないことを確認する
  - `FeedbackModal`: 1001 文字メッセージで送信するとエラー表示されることを確認する
  - `FeedbackModal`: 送信成功後に `onClose` が呼ばれることを確認する
  - _Requirements: 1.4, 1.5, 2.1, 2.2, 2.3, 3.5_

- [x] 5.4 E2E テストの実装（Playwright）
  - ヘッダーのフィードバックボタンクリック → モーダル表示 → カテゴリ + メッセージ入力 → 送信 → 成功メッセージ表示の一連のフローを確認する
  - モーダル外クリックでモーダルが閉じることを確認する
  - _Requirements: 1.1, 1.2, 1.5, 3.5_
