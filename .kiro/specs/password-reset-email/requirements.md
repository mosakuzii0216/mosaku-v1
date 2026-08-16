# Requirements Document

## Project Description (Input)

パスワードリセットのメール送信を本実装する。

【背景】現在 backend の POST /auth/reset-password（auth.controller.ts:428-464）はユーザー検索のみ行い、メール送信は `// TODO: メール送信機能を実装` のまま未実装。常に「If the email exists, a password reset link has been sent.」を返すが実際には何も送られない。一方フロントには PasswordReset.tsx / PasswordResetForm.tsx の UI が存在するため、メール＋パスワードで登録したユーザーがパスワードを忘れると復旧不能（OAuth ユーザーは password=null のため対象外）。User モデルには resetPasswordToken / resetPasswordExpires カラムが既に存在する。

【ゴール】メール基盤（第一候補: Resend。無料枠あり・開発者向け・API キー1つで送信可能）を導入し、(1) リセット要求でランダムトークンを発行し resetPasswordToken（ハッシュ化して保存）と resetPasswordExpires（例: 1時間後）を設定、(2) リセット URL を登録メールアドレスへ送信、(3) トークン検証 + 新パスワード設定エンドポイントを実装、(4) トークンは単回使用・期限切れ無効・成功時にクリア。

【非機能・制約】メールプロバイダの API キーとリセット URL のベースは環境変数化し .env.example に追記。パスワードハッシュは既存の bcrypt 規約・password-strength バリデータに準拠。エラーは既存の ERROR_CODES / AppException、ログは AppLogger、レート制限は @nestjs/throttler に従う。ユーザー列挙攻撃対策として「メールが存在すれば送信」の曖昧レスポンスを維持。メール送信失敗時もユーザーには曖昧レスポンスを返しつつ Sentry に記録。本番は Cloud Run（backend）+ Vercel（frontend）構成。

【対象外】パスワード変更（change-password は実装済み）、OAuth 専用アカウントのパスワード新規設定、メールテンプレートの多言語化（日本語のみで可）。

## Introduction

本仕様は、メール＋パスワードで登録したユーザーがパスワードを忘れた際に、登録メールアドレス宛のリセットリンクを通じてパスワードを再設定できる機能を本実装する。既存の `POST /auth/reset-password` はユーザー検索のみで実際のメール送信が未実装であり、フロントの UI（PasswordReset.tsx / PasswordResetForm.tsx）が機能しない状態にある。本機能ではメール送信基盤（第一候補: Resend）を導入し、トークン発行 → メール送信 → トークン検証 → 新パスワード設定 → トークン無効化までの一連のフローを、既存の認証アーキテクチャ（グローバル JWT Guard + `@Public()`、`ERROR_CODES` / `AppException`、`AppLogger`、`@nestjs/throttler`、bcrypt + password-strength バリデータ）に準拠して実現する。ユーザー列挙攻撃に対する防御として、メールアドレスの存在有無にかかわらず一貫した曖昧レスポンスを維持することを最重要のセキュリティ要件とする。

## Requirements

### Requirement 1: パスワードリセット要求とトークン発行

**Objective:** メール＋パスワードで登録したユーザーとして、パスワードを忘れたときにリセットを要求したい。それにより、自分のアカウントへのアクセスを安全に回復できる。

#### Acceptance Criteria

1. When ユーザーが登録済みのメールアドレスで `POST /auth/reset-password` を実行したとき、the Password Reset Service shall 暗号論的に安全なランダムトークンを生成し、そのハッシュ値を `resetPasswordToken` に、有効期限（発行時刻 + 1時間）を `resetPasswordExpires` に保存する。
2. The Password Reset Service shall リセットトークンを平文ではなくハッシュ化して `resetPasswordToken` に保存する。
3. When 同一ユーザーが再度リセットを要求したとき、the Password Reset Service shall 既存の `resetPasswordToken` / `resetPasswordExpires` を新しい値で上書きし、以前のトークンを無効化する。
4. If リクエストされたメールアドレスに対応するユーザーの `password` が `null`（OAuth 専用アカウント）であるとき、then the Password Reset Service shall リセットトークンを発行せず、メールも送信しない。
5. The Password Reset Service shall トークン生成・保存・送信の各処理を `AppLogger` で記録する（ただしトークン平文やメールアドレスを PII ポリシーに反する形で出力しない）。

### Requirement 2: リセットメールの送信

**Objective:** ユーザーとして、リセット要求後に登録メールアドレスでリセットリンクを受け取りたい。それにより、メールから安全にパスワード再設定画面へ遷移できる。

#### Acceptance Criteria

1. When リセットトークンが正常に発行されたとき、the Password Reset Service shall メール送信基盤（Resend）を介して、登録メールアドレス宛にリセット URL を含むメールを送信する。
2. The Password Reset Service shall リセット URL を `{リセット URL ベース}?token={平文トークン}` 形式（フロントの PasswordResetForm.tsx が解釈可能な形式）で構築する。
3. The Password Reset Service shall リセットメールの本文・件名を日本語で構成する。
4. If メール送信が失敗したとき、then the Password Reset Service shall 障害内容を Sentry へ記録し、ユーザーには成功時と同一の曖昧レスポンスを返す。
5. The Password Reset Service shall メール送信処理の例外がリセット要求エンドポイントのレスポンス（曖昧メッセージ）を変化させないようにする。

### Requirement 3: ユーザー列挙攻撃への防御

**Objective:** サービス運営者として、リセット機能を通じてメールアドレスの登録有無が漏洩しないようにしたい。それにより、ユーザー列挙攻撃を防止できる。

#### Acceptance Criteria

1. When リクエストされたメールアドレスが存在するときも存在しないときも、the Password Reset Service shall 同一のメッセージ（「メールが存在すればリセットリンクを送信した」旨）を返す。
2. While メールアドレスが存在しない、または OAuth 専用アカウントであるとき、the Password Reset Service shall メールを送信しないが、レスポンスは存在する場合と区別できない内容とする。
3. The Password Reset Service shall リセット要求の成否・分岐によってレスポンスのステータスコードや構造がメールアドレスの存在有無を有意に示さないようにする。
4. The Password Reset Service shall リセット要求エンドポイントを `@Public()` として公開しつつ、`@nestjs/throttler` によるレート制限を適用する。

### Requirement 4: トークン検証と新パスワード設定

**Objective:** ユーザーとして、メール内のリンクから新しいパスワードを設定したい。それにより、再びアカウントにログインできるようになる。

#### Acceptance Criteria

1. When ユーザーがトークンと新パスワードを伴ってパスワード確定エンドポイントを実行したとき、the Password Reset Service shall 受領トークンをハッシュ化し、保存済み `resetPasswordToken` と照合する。
2. If 受領トークンが保存済みハッシュと一致しないとき、then the Password Reset Service shall `ERROR_CODES` に基づくエラー（無効トークン）を返し、パスワードを変更しない。
3. If `resetPasswordExpires` が現在時刻を過ぎているとき、then the Password Reset Service shall 期限切れエラーを返し、パスワードを変更しない。
4. When トークン検証が成功し新パスワードが受領されたとき、the Password Reset Service shall 新パスワードを既存の password-strength バリデータで検証する。
5. If 新パスワードが強度要件を満たさないとき、then the Password Reset Service shall 既存の `ERROR_CODES` に基づくバリデーションエラーを返し、パスワードを変更しない。
6. When すべての検証が成功したとき、the Password Reset Service shall 新パスワードを既存の bcrypt 規約でハッシュ化して `password` カラムへ保存する。

### Requirement 5: トークンのライフサイクル管理

**Objective:** サービス運営者として、リセットトークンが単回かつ短時間しか使えないようにしたい。それにより、漏洩・再利用による不正アクセスのリスクを最小化できる。

#### Acceptance Criteria

1. When パスワード再設定が成功したとき、the Password Reset Service shall `resetPasswordToken` と `resetPasswordExpires` を `null` にクリアする。
2. If 既に使用済み（クリア済み）のトークンで再度パスワード確定を試みたとき、then the Password Reset Service shall 無効トークンエラーを返し、パスワードを変更しない。
3. The Password Reset Service shall トークンの有効期限を発行時刻から1時間とする。
4. The Password Reset Service shall パスワード再設定の確定エンドポイントに `@nestjs/throttler` によるレート制限を適用する。
5. Where 既存の Refresh Token revoke 機構が存在するとき、the Password Reset Service shall パスワード再設定成功時に当該ユーザーの既存 Refresh Token を無効化する。

### Requirement 6: 設定・環境変数・運用

**Objective:** 開発者として、メール基盤とリセット URL を環境ごとに差し替えたい。それにより、ローカル・本番（Cloud Run + Vercel）の各環境で安全に機能を運用できる。

#### Acceptance Criteria

1. The Password Reset Service shall メールプロバイダの API キーを環境変数から読み込む。
2. The Password Reset Service shall リセット URL のベース（フロントエンドのリセット画面 URL）を環境変数から読み込む。
3. The Password Reset Service shall 追加した環境変数を `.env.example` に記載する。
4. If メール基盤の API キーが未設定で起動したとき、then the Password Reset Service shall 警告ログを出力して起動を継続し（OAuth Strategy 未設定時と同様の挙動）、リセット要求時には曖昧レスポンスを維持する。
5. The Password Reset Service shall Sentry イベントを既存の `feature_area` タグ契約（`auth`）に従って分類する。
