# OAuth プロバイダー設定ガイド

Apple・X（Twitter）の OAuth アプリを各プラットフォームで設定する手順をまとめます。

> **重要**: 本番環境とステージング環境では、それぞれ別の OAuth アプリを作成してください。同一アプリを共有すると、コールバック URL の競合やセキュリティリスクが生じます。

---

## 環境変数マッピング

設定後に取得したクレデンシャルを以下の環境変数に設定してください。

| プロバイダー | プラットフォームの呼称   | 環境変数名                                                                     |
| ------------ | ------------------------ | ------------------------------------------------------------------------------ |
| Apple        | Service ID               | `APPLE_CLIENT_ID`                                                              |
| Apple        | Team ID                  | `APPLE_TEAM_ID`                                                                |
| Apple        | Key ID                   | `APPLE_KEY_ID`                                                                 |
| Apple        | Private Key (.p8 の内容) | `APPLE_PRIVATE_KEY`                                                            |
| Apple        | Callback URL             | `APPLE_REDIRECT_URI`（省略可: デフォルト `{BACKEND_URL}/auth/apple/callback`） |
| X            | Client ID                | `X_CLIENT_ID`                                                                  |
| X            | Client Secret            | `X_CLIENT_SECRET`                                                              |
| X            | Callback URL             | `X_REDIRECT_URI`（省略可: デフォルト `{BACKEND_URL}/auth/x/callback`）         |

> **補足**: `APPLE_PRIVATE_KEY` の値は `.p8` ファイルの中身をそのまま設定します。改行は `\n` でエスケープするか、環境に応じてリテラル改行を使用してください。

---

## Apple（Sign in with Apple）

### 1. Apple Developer Portal にアクセス

[Apple Developer Portal](https://developer.apple.com/account/) にログインします（有料の Apple Developer Program 登録が必要）。

### 2. App ID を作成（未作成の場合）

1. 「Identifiers」→「+」→「App IDs」
2. Capabilities で **Sign In with Apple** を有効化
3. App ID を登録

### 3. Service ID を作成

1. 「Identifiers」→「+」→「Services IDs」
2. Description と Identifier（例: `com.yourapp.signin`）を入力
3. 作成後、**Sign In with Apple** を有効化して「Configure」をクリック
4. Primary App ID に先ほど作成した App ID を選択
5. **Domains and Subdomains** にバックエンドのドメインを追加
6. **Return URLs** に以下を追加:
   - 本番: `https://{本番バックエンドURL}/auth/apple/callback`
   - ステージング: `https://{ステージングバックエンドURL}/auth/apple/callback`
7. 「Save」→「Continue」→「Register」

> **注意**: ローカル開発環境（http://localhost）は Apple が許可しません。ステージング環境の URL を代わりに使用してください。

### 4. 秘密鍵（.p8）を作成・ダウンロード

1. 「Keys」→「+」
2. Key Name を入力し、**Sign in with Apple** を有効化
3. Configure で Primary App ID を選択
4. 「Continue」→「Register」
5. **「Download」ボタンをクリックして .p8 ファイルをダウンロード**

> ⚠️ **重要**: 秘密鍵は作成時に **1 回しかダウンロードできません**。ダウンロード後は安全な場所に保管してください。紛失した場合は新しい Key を作成し直す必要があります。

### 5. クレデンシャルを取得・設定

- **Service ID の Identifier** → `APPLE_CLIENT_ID`
- **Team ID**（Developer Portal 右上に表示）→ `APPLE_TEAM_ID`
- **Key ID**（Keys 一覧に表示）→ `APPLE_KEY_ID`
- **.p8 ファイルの内容**（テキストエディタで開いてコピー）→ `APPLE_PRIVATE_KEY`

---

## X（Twitter）

### 1. X Developer Portal にアクセス

[X Developer Portal](https://developer.twitter.com/en/portal/dashboard) にログインします。Developer アカウントへの申請が必要な場合があります。

### 2. アプリを作成

1. 「Projects & Apps」→「New Project」（または「New App」）
2. プロジェクト名・用途を入力して作成
3. アプリを作成してダッシュボードに移動

### 3. OAuth 2.0 を有効化

1. アプリの「Settings」タブを開く
2. **User authentication settings** の「Set up」をクリック
3. 以下を設定:
   - **App permissions**: `Read` （最小権限）
   - **Type of App**: `Web App, Automated App or Bot`
   - **OAuth 2.0**: 有効化
4. **Callback URI / Redirect URL** に以下を追加:
   - 本番: `https://{本番バックエンドURL}/auth/x/callback`
   - ステージング: `https://{ステージングバックエンドURL}/auth/x/callback`
   - ローカル: `http://localhost:3000/auth/x/callback`
5. **Website URL** にサービスの URL を入力
6. 「Save」をクリック

### 4. クレデンシャルを取得

アプリの「Keys and tokens」タブから:

- **OAuth 2.0 Client ID** → `X_CLIENT_ID`
- **OAuth 2.0 Client Secret** → `X_CLIENT_SECRET`（「Regenerate」で生成・表示される）

> **注意**: X の無料 API Tier ではメールアドレスが取得できません。メールアドレスが必要な場合は有料プランをご検討ください。

---

## ステージング環境の注意事項

- **Apple**: Service ID は環境ごとに別 Identifier を使用することを推奨します（例: `com.yourapp.signin.staging`）。
- **X**: 本番・ステージングで別のアプリを作成し、それぞれのコールバック URL を設定してください。

本番デプロイ手順は [cloud-run.md](./cloud-run.md) を参照してください。
