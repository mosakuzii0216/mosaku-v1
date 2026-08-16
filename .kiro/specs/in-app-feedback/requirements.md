# Requirements Document

## Introduction

アプリ内フィードバック機能は、ログイン済みユーザーが Mosaku アプリ内から「不具合 / 改善要望 / その他」を直接送信できる仕組みを提供する。送信内容はバックエンドを経由して Slack の `#feedback` チャンネルに通知され、開発者・運営がリアルタイムでユーザーの声を受け取れるようにする。6月末の友人・家族向け限定公開に向けてフィードバック収集の手段として機能させることが主目的。

## Requirements

### Requirement 1: フィードバックフォーム UI

**Objective:** As a ログイン済みユーザー, I want ヘッダーや設定ページからすぐにフィードバックフォームを開けること, so that アプリを使いながらスムーズに意見・不具合を報告できる

#### Acceptance Criteria

1. When ユーザーがヘッダーのフィードバックボタンをクリックしたとき, the Feedback Service shall モーダルダイアログでフィードバックフォームを表示する
2. When ユーザーが設定ページのフィードバックセクションをクリックしたとき, the Feedback Service shall モーダルダイアログでフィードバックフォームを表示する
3. The Feedback Service shall フォーム内にカテゴリ選択（不具合 / 改善要望 / その他）とメッセージ入力エリアを提供する
4. The Feedback Service shall カテゴリのデフォルト選択なし（未選択）の状態でフォームを表示する
5. When ユーザーがモーダル外をクリックまたは閉じるボタンを押したとき, the Feedback Service shall フォームを閉じ入力内容を破棄する

### Requirement 2: 入力バリデーション

**Objective:** As a ログイン済みユーザー, I want 送信前に不正な入力を検知してもらいたい, so that 意図した内容が確実に届くことを確認できる

#### Acceptance Criteria

1. If ユーザーがカテゴリを選択せずに送信ボタンを押したとき, then the Feedback Service shall カテゴリが必須である旨のエラーメッセージを表示して送信を中断する
2. If ユーザーがメッセージを空白のまま送信ボタンを押したとき, then the Feedback Service shall メッセージが必須である旨のエラーメッセージを表示して送信を中断する
3. If メッセージが1000文字を超えているとき, then the Feedback Service shall 文字数上限超過のエラーメッセージを表示して送信を中断する
4. The Feedback Service shall メッセージ入力エリアに現在の文字数と上限（例: 120 / 1000）をリアルタイムで表示する
5. When フォームがバリデーションエラーを含むとき, the Feedback Service shall 送信ボタンを押せる状態のまま維持し、エラー箇所をハイライト表示する

### Requirement 3: フィードバック送信 API

**Objective:** As a ログイン済みユーザー, I want フィードバックを安全に送信したい, so that 自分の名前やメールアドレスを手入力せず正確な情報が届く

#### Acceptance Criteria

1. When ユーザーが有効なカテゴリとメッセージを入力して送信ボタンを押したとき, the Feedback Service shall バックエンドの POST `/feedback` エンドポイントにリクエストを送信する
2. The Feedback Service shall 送信者のメールアドレスと表示名をサーバー側で JWT 認証情報から自動付与し、クライアントからは受け取らない
3. The Feedback Service shall 未認証リクエストを `401 Unauthorized` で拒否する
4. While フィードバックがサーバーに送信中のとき, the Feedback Service shall 送信ボタンをローディング状態にして重複送信を防ぐ
5. When フィードバックの送信が成功したとき, the Feedback Service shall 成功メッセージを表示してフォームを自動的に閉じる

### Requirement 4: Slack 通知

**Objective:** As a 開発者・運営, I want フィードバックを Slack #feedback チャンネルでリアルタイム受信したい, so that すぐに内容を確認して対応の優先度を判断できる

#### Acceptance Criteria

1. When フィードバックが正常にサーバーへ到達したとき, the Feedback Service shall 設定された Slack Webhook URL に通知ペイロードを送信する
2. The Feedback Service shall Slack 通知にカテゴリ・メッセージ・送信者名・メールアドレス・送信日時（JST）を含める
3. The Feedback Service shall カテゴリ別に Slack メッセージの絵文字・色を変える（不具合: 🔴、改善要望: 🟡、その他: 🔵）
4. If Slack Webhook へのリクエストが失敗したとき, then the Feedback Service shall エラーを Sentry に記録し、クライアントには 500 エラーではなく送信成功を返す（Slack 障害でユーザー体験を損なわない）
5. The Feedback Service shall Slack Webhook URL を環境変数（`SLACK_FEEDBACK_WEBHOOK_URL`）で管理し、コードにハードコードしない

### Requirement 5: セキュリティとレート制限

**Objective:** As a 開発者・運営, I want 不正利用やスパムを防止したい, so that フィードバックチャンネルが本物のユーザーからの意見のみで機能する

#### Acceptance Criteria

1. The Feedback Service shall フィードバック送信エンドポイントをグローバル JWT Guard の保護下に置き、`@Public()` で除外しない
2. The Feedback Service shall フィードバック送信エンドポイントに既存の `@nestjs/throttler` を適用し、同一ユーザーからの過剰なリクエストを制限する
3. If ユーザーがレート制限を超えた送信を試みたとき, then the Feedback Service shall `429 Too Many Requests` を返し、フロントエンドには適切なエラーメッセージを表示する
4. The Feedback Service shall バックエンドでも DTO バリデーション（`class-validator`）を使ってカテゴリとメッセージの妥当性を検証する
