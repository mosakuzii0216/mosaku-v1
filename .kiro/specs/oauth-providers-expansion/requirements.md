# Requirements Document

## Project Description (Input)

LINE・Apple・X（Twitter）OAuthプロバイダーの追加。現在Google/GitHubのPassport.js実装に、LINE Login API・Sign in with Apple・X OAuth 2.0を追加する。招待制のクローズドサービスなので、既存の招待コードフローとの統合も必要。

---

## Introduction

MosakuはGoogle・GitHubに加え、LINE・Apple・X（Twitter）の3プロバイダーによるOAuthログインをサポートする。各プロバイダーは既存のPassport.jsアーキテクチャ（Strategy / Guard / OAuthService）に準拠して実装する。招待制サービスのため、新規ユーザーは招待コードの提示が必須であり、全プロバイダーで統一されたフローを維持する。

---

## Requirements

### Requirement 1: LINE OAuthログイン

**Objective:** ユーザーとして、LINEアカウントでMosakuにログイン・登録できるようにしたい。そうすることで、日本語圏のメインコミュニケーションツールを使って手軽にアクセスできる。

#### Acceptance Criteria

1. When ユーザーが「LINEでログイン」ボタンをクリックしたとき、the Auth System shall LINE OAuth認可画面にリダイレクトする
2. When LINE認証が成功し既存ユーザーのとき、the Auth System shall JWTを発行しフロントエンドの成功URLへリダイレクトする
3. When LINE認証が成功し新規ユーザーのとき、the Auth System shall 招待コード入力画面へリダイレクトする（`invitation code` エラーを通知して）
4. If LINE APIからプロフィール情報（lineId・name）が取得できないとき、the Auth System shall 認証失敗URLへリダイレクトする
5. The Auth System shall LINE OAuthコールバックに `GET /auth/line/callback` エンドポイントを提供する
6. The Auth System shall 招待コード付きLINE新規登録に `POST /auth/line/register-with-invitation` エンドポイントを提供する

---

### Requirement 2: Sign in with Apple（Apple OAuth）

**Objective:** ユーザーとして、AppleIDでMosakuにログイン・登録できるようにしたい。そうすることで、iOSやMacユーザーがネイティブな認証体験を利用できる。

#### Acceptance Criteria

1. When ユーザーが「Appleでサインイン」ボタンをクリックしたとき、the Auth System shall Apple OAuth認可画面にリダイレクトする
2. When Apple認証が成功し既存ユーザーのとき、the Auth System shall JWTを発行しフロントエンドの成功URLへリダイレクトする
3. When Apple認証が成功し新規ユーザーのとき、the Auth System shall 招待コード入力画面へリダイレクトする
4. When Appleが初回認証時のみメールアドレスを返す仕様のとき、the Auth System shall appleIdを主キーとしてユーザーを識別し、メールがない場合でも正常に処理する
5. If Apple JWTトークンの検証に失敗したとき、the Auth System shall 認証失敗URLへリダイレクトする
6. The Auth System shall Apple OAuthコールバックに `POST /auth/apple/callback`（Appleの仕様によりPOST）エンドポイントを提供する
7. The Auth System shall 招待コード付きApple新規登録に `POST /auth/apple/register-with-invitation` エンドポイントを提供する

---

### Requirement 3: X（Twitter）OAuth 2.0ログイン

**Objective:** ユーザーとして、Xアカウントでログイン・登録できるようにしたい。そうすることで、Xを日常的に使うユーザーが追加の登録手続きなしにアクセスできる。

#### Acceptance Criteria

1. When ユーザーが「Xでログイン」ボタンをクリックしたとき、the Auth System shall X OAuth 2.0認可画面にリダイレクトする
2. When X認証が成功し既存ユーザーのとき、the Auth System shall JWTを発行しフロントエンドの成功URLへリダイレクトする
3. When X認証が成功し新規ユーザーのとき、the Auth System shall 招待コード入力画面へリダイレクトする
4. If XからユーザーID（xId）が取得できないとき、the Auth System shall 認証失敗URLへリダイレクトする
5. The Auth System shall X OAuthコールバックに `GET /auth/x/callback` エンドポイントを提供する
6. The Auth System shall 招待コード付きX新規登録に `POST /auth/x/register-with-invitation` エンドポイントを提供する

---

### Requirement 4: データベース・ユーザーモデルの拡張

**Objective:** システムとして、LINE・Apple・XのOAuth IDをユーザーレコードに保存したい。そうすることで、各プロバイダーのユーザーを一意に識別できる。

#### Acceptance Criteria

1. The Auth System shall Userモデルに `lineId`（文字列・nullable）フィールドを追加する
2. The Auth System shall Userモデルに `appleId`（文字列・nullable）フィールドを追加する
3. The Auth System shall Userモデルに `xId`（文字列・nullable）フィールドを追加する
4. When 各IDフィールドに値が設定されているとき、the Auth System shall そのフィールドにユニーク制約を適用する
5. The Auth System shall 既存のGoogle・GitHubフィールドと同様のスキーマ設計パターンに従う

---

### Requirement 5: 招待コードフローとの統合

**Objective:** 管理者とユーザーとして、新規OAuthユーザーが招待コードなしに登録できないことを保証したい。そうすることで、サービスの招待制クローズドポリシーを維持できる。

#### Acceptance Criteria

1. When 新規OAuthユーザーが招待コードなしに認証を完了したとき、the Auth System shall 招待コード入力が必要なことを示すURLパラメータ付きでフロントエンドにリダイレクトする
2. When `register-with-invitation` エンドポイントに無効な招待コードが送信されたとき、the Auth System shall 400エラーを返す
3. When `register-with-invitation` が成功したとき、the Auth System shall 招待コードの使用回数をインクリメントし、JWTを発行する
4. The Auth System shall LINE・Apple・Xの全プロバイダーで、Google・GitHubと同一の招待コード検証ロジック（`InvitationService`）を使用する

---

### Requirement 6: フロントエンドUIの対応

**Objective:** ユーザーとして、ログイン・登録画面でLINE・Apple・Xのログインボタンを選択できるようにしたい。そうすることで、好みのプロバイダーを使って直感的に認証できる。

#### Acceptance Criteria

1. The Auth System shall ログイン画面にLINE・Apple・Xの各OAuthログインボタンを表示する
2. When ユーザーがOAuthボタンをクリックしたとき、the Auth System shall バックエンドの対応する `GET /auth/{provider}` エンドポイントにリダイレクトする
3. The Auth System shall 既存のGoogle・GitHubボタンと一貫したUIデザインを維持する
4. When 招待コードが必要なOAuthプロバイダーへのリダイレクト後、the Auth System shall どのプロバイダーと一時ユーザー情報を使って招待コード入力フォームを表示する
5. If OAuth認証が失敗したとき、the Auth System shall ユーザーにエラーメッセージを表示する

---

### Requirement 7: 環境変数・設定

**Objective:** 運用者として、各OAuthプロバイダーのクレデンシャルを環境変数で設定できるようにしたい。そうすることで、環境ごとに安全にシークレットを管理できる。

#### Acceptance Criteria

1. The Auth System shall バックエンドに `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET` の環境変数をサポートする
2. The Auth System shall バックエンドに `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` の環境変数をサポートする
3. The Auth System shall バックエンドに `X_CLIENT_ID` / `X_CLIENT_SECRET` の環境変数をサポートする
4. The Auth System shall フロントエンドに `VITE_LINE_CLIENT_ID` / `VITE_APPLE_CLIENT_ID` / `VITE_X_CONSUMER_KEY` のオプショナル環境変数をサポートする（`env.ts` に `xConsumerKey` は既存）
5. If 必要な環境変数が未設定のとき、the Auth System shall アプリケーション起動時に警告ログを出力し、該当プロバイダーのエンドポイントを無効化する

---

### Requirement 8: 各プラットフォームのOAuthアプリ設定

**Objective:** 開発者・運用者として、LINE・Apple・Xの各プラットフォームでOAuthアプリを正しく設定できるようにしたい。そうすることで、認証フローが正常に動作する状態を再現性高くセットアップできる。

#### Acceptance Criteria

1. The Auth System shall LINE Developersコンソールでのチャンネル作成手順をドキュメント化する（チャンネル種別: LINEログイン、コールバックURL: `{BACKEND_URL}/auth/line/callback` の登録を含む）
2. The Auth System shall Apple Developer PortalでのSign in with Apple設定手順をドキュメント化する（Service ID作成・ドメイン検証・Return URL: `{BACKEND_URL}/auth/apple/callback` の登録・秘密鍵（.p8）ダウンロードを含む）
3. The Auth System shall X（Twitter）Developer PortalでのOAuth 2.0アプリ設定手順をドキュメント化する（アプリ作成・OAuth 2.0有効化・コールバックURL: `{BACKEND_URL}/auth/x/callback` の登録・User authentication settings の設定を含む）
4. The Auth System shall 各プロバイダーの設定で取得したクレデンシャルと対応する環境変数名のマッピングをドキュメント化する
5. Where ステージング環境が存在するとき、the Auth System shall 本番・ステージングそれぞれで別アプリを作成する必要があることをドキュメント化する
