# Implementation Plan

## oauth-providers-expansion

---

- [x] 1. DBスキーマに LINE・Apple・X の OAuth ID フィールドを追加する
- [x] 1.1 Prisma スキーマに lineId・appleId・xId フィールドを追加してマイグレーションを作成する
  - `User` モデルに `lineId`・`appleId`・`xId` を nullable unique フィールドとして追加する
  - 各フィールドに `@unique` 制約と `@map` でスネークケースのカラム名を設定する
  - `npx prisma migrate dev --name add-line-apple-x-oauth-ids` でマイグレーションファイルを生成する
  - `npx prisma generate` で Prisma クライアントを再生成する
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

---

- [ ] 2. OAuth 型定義と ConfigService を拡張する
- [x] 2.1 (P) OAuthProvider 型と各プロバイダーの StrategyUser 型を追加する
  - `OAuthProvider` 型に `'line'`・`'apple'`・`'x'` を追加する
  - `LineStrategyUser`・`AppleStrategyUser`・`XStrategyUser` インターフェースを定義する
  - `OAuthStrategyUser` の union 型に3つの新型を追加する
  - Apple の `appleId`（sub クレーム）と `name`（初回のみ）の型を nullable で設計する
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 2.2 (P) ConfigService に LINE・Apple・X のクレデンシャル取得ロジックを追加する
  - LINE 用の `lineClientId`・`lineClientSecret`・`lineRedirectUri` getter を追加する
  - Apple 用の `appleClientId`・`appleTeamId`・`appleKeyId`・`applePrivateKey` getter を追加する（`applePrivateKey` は環境変数内の `\n` を改行に変換して返す）
  - X 用の `xClientId`・`xClientSecret`・`xRedirectUri` getter を追加する
  - 各プロバイダーのデフォルトリダイレクト URI を `http://localhost:3000/auth/{provider}/callback` に設定する
  - _Requirements: 7.1, 7.2, 7.3_

---

- [x] 3. LINE・Apple・X の Passport Strategy と Guard を実装する
- [x] 3.1 (P) LINE Strategy と Guard を実装する
  - `passport-line-auth` をバックエンド依存に追加する
  - `passport-line-auth` の `Strategy` を `PassportStrategy` でラップした `LineStrategy` クラスを作成する
  - `configService.lineClientId` / `lineClientSecret` が未設定の場合は constructor でエラーをスローする
  - `validate` メソッドで LINE プロフィール（`userId`・`displayName`・`pictureUrl`・`email`）を `LineStrategyUser` に変換する
  - `LineAuthGuard` を `AuthGuard('line')` として作成する
  - _Requirements: 1.1, 1.4, 7.1_

- [x] 3.2 (P) Apple Strategy と Guard を実装する
  - `passport-apple` をバックエンド依存に追加する
  - `AppleStrategy` クラスを作成し、`clientID`（Service ID）・`teamID`・`keyID`・`privateKeyString` を ConfigService から取得して設定する
  - コールバックは POST 仕様のため `callbackURL` を `appleRedirectUri` に設定する
  - `validate` メソッドで Apple の `sub`（appleId）・`email`（初回のみ）・`name`（初回のみ）を `AppleStrategyUser` に変換し、`name` が取得できない場合は `'Apple User'` をフォールバックとして使用する
  - `AppleAuthGuard` を `AuthGuard('apple')` として作成する
  - _Requirements: 2.1, 2.4, 2.5, 7.2_

- [x] 3.3 (P) X Strategy と Guard を実装する
  - `passport-twitter-oauth2` をバックエンド依存に追加する
  - `XStrategy` クラスを作成し、OAuth 2.0 の `clientID`・`clientSecret`・`callbackURL` を ConfigService から取得して設定する
  - `validate` メソッドで X プロフィール（`id`・`username`・`name`）を `XStrategyUser` に変換する（`email` は無料 API tier で取得不可のため常に optional とする）
  - `XAuthGuard` を `AuthGuard('twitter-oauth2')` として作成する
  - _Requirements: 3.1, 3.4, 7.3_

---

- [x] 4. OAuthService に LINE・Apple・X のログイン・登録処理を追加する
- [x] 4.1 handleOAuthLogin をプロバイダーフィールド対応に拡張する
  - `UserProviderField` 型（`'oauthId' | 'lineId' | 'appleId' | 'xId'`）を定義する
  - `handleOAuthLogin` にプロバイダーフィールド名引数を追加し、検索・更新クエリが指定フィールドを使用するよう変更する
  - 既存の Google/GitHub は引き続き `oauthId` フィールドを使用することを確認する
  - _Requirements: 4.1, 4.2, 4.3, 5.4_

- [x] 4.2 LINE・Apple・X のログイン・招待コード付き登録メソッドを追加する
  - `lineLogin`・`lineRegisterWithInvitation` メソッドを追加し、`BaseOAuthUser` に正規化して共通メソッドを呼ぶ
  - `appleLogin`・`appleRegisterWithInvitation` メソッドを追加する（`fallbackEmail` パラメータを受け取り、メールなし新規登録に対応する）
  - `xLogin`・`xRegisterWithInvitation` メソッドを追加する
  - 各メソッドで対応する `providerField`（`lineId`・`appleId`・`xId`）を指定して共通ロジックを呼び出す
  - _Requirements: 1.2, 1.3, 1.4, 2.2, 2.3, 2.4, 3.2, 3.3, 3.4, 5.1, 5.2, 5.3, 5.4_

---

- [x] 5. 各プロバイダーの DTO と AuthController エンドポイントを追加する
- [x] 5.1 (P) LINE・Apple・X の register-with-invitation DTO を作成する
  - `LineRegisterWithInvitationDto`（`lineUser: Record<string, unknown>`・`invitationCode: string`）を作成する
  - `AppleRegisterWithInvitationDto`（`appleUser`・`invitationCode`・`fallbackEmail?: string`）を作成する（`fallbackEmail` は `@IsEmail() @IsOptional()`）
  - `XRegisterWithInvitationDto`（`xUser`・`invitationCode`）を作成する
  - `class-validator` デコレータで各フィールドを検証する
  - _Requirements: 1.6, 2.7, 3.6_

- [x] 5.2 AuthController に LINE・X のエンドポイントを追加する
  - `GET /auth/line`・`GET /auth/line/callback` エンドポイントを追加し、`handleOAuthCallback` 共通メソッドで処理する
  - `POST /auth/line/register-with-invitation` エンドポイントを追加する
  - `GET /auth/x`・`GET /auth/x/callback` エンドポイントを追加する
  - `POST /auth/x/register-with-invitation` エンドポイントを追加する
  - 各エンドポイントで対応する Guard と OAuthService メソッドを使用する
  - _Requirements: 1.5, 1.6, 3.5, 3.6_

- [x] 5.3 AuthController に Apple の POST コールバックエンドポイントを追加する
  - `GET /auth/apple` エンドポイントを追加する
  - `POST /auth/apple/callback` エンドポイントを `@Post`・`@Public()`・`@UseGuards(AppleAuthGuard)` で追加する（Apple の仕様により GET ではなく POST）
  - `POST /auth/apple/register-with-invitation` エンドポイントを追加し、`fallbackEmail` を OAuthService に渡す
  - _Requirements: 2.6, 2.7_

---

- [x] 6. AuthModule に新プロバイダーを登録する
- [x] 6.1 AuthModule の providers・exports に新クラスを登録する
  - `LineStrategy`・`AppleStrategy`・`XStrategy` を providers に追加する
  - `LineAuthGuard`・`AppleAuthGuard`・`XAuthGuard` を providers と exports に追加する
  - 各 Strategy のインポート文を追加する
  - 既存の Google/GitHub の登録と同じパターンで追加されていることを確認する
  - _Requirements: 1.1, 2.1, 3.1_

---

- [x] 7. フロントエンドに LINE・Apple・X のログインボタンと招待コードフローを追加する
- [x] 7.1 (P) EmailAuthForm にログインボタンを追加する
  - 既存の Google・GitHub ボタンの下に LINE・Apple・X のボタンを追加する
  - 各ボタンクリックで `getBackendUrl()` + `/auth/{provider}` へリダイレクトする（既存パターンと同様）
  - Apple ボタンは Apple HIG に従い黒背景・白テキストとする
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 7.2 (P) AuthContext に LINE・Apple・X の招待コード登録関数を追加する
  - `lineRegisterWithInvitation`・`appleRegisterWithInvitation`（`fallbackEmail?` 引数あり）・`xRegisterWithInvitation` 関数を追加する
  - 各関数は `apiClient` 経由で対応する `POST /auth/{provider}/register-with-invitation` を呼び出す
  - 既存の `googleRegisterWithInvitation`・`githubRegisterWithInvitation` と同じ実装パターンを踏襲する
  - _Requirements: 6.4_

- [x] 7.3 AuthForm の AuthMode と招待コードフローに新プロバイダーを追加する
  - `AuthMode` 型に `'lineInvite'`・`'appleInvite'`・`'xInvite'` を追加する
  - `providers` 配列に LINE・Apple・X のエントリを追加する（`sessionStorage` キーと mode のマッピング）
  - `getProviderName` 関数を拡張して新モードに対応する
  - `appleInvite` モードでは `pendingOAuthUser.email` が存在しない場合にメールアドレス入力フィールドを追加表示する
  - `handleOAuthRegistration` で新プロバイダーの登録関数を呼び出せるよう拡張する
  - `OAuthInviteForm` の `providerName` 型に `'LINE'`・`'Apple'`・`'X'` を追加する
  - _Requirements: 6.4, 6.5_

---

- [x] 8. 環境変数の未設定時の警告ログを実装する
- [x] 8.1 アプリケーション起動時に未設定プロバイダーを検出して警告ログを出力する
  - 各 Strategy の constructor で未設定の場合に `AppLogger.warn` を使用して警告ログを出力する（既存のエラースローから警告ログ+エンドポイント無効化に変更）
  - または NestJS の `onApplicationBootstrap` フックで全プロバイダーの設定状態をチェックしてログ出力する
  - 未設定プロバイダーのエンドポイントアクセス時に 503 または適切なエラーを返す設計を検討する
  - _Requirements: 7.4, 7.5_

---

- [x] 9. 各プラットフォームの OAuth アプリ設定ドキュメントを作成する
- [x] 9.1 (P) LINE・Apple・X の設定手順を docs にまとめる
  - `docs/deployment/oauth-setup.md` を作成し LINE Developers・Apple Developer Portal・X Developer Portal それぞれの設定手順を記載する
  - LINE: LINEログインチャンネル作成→コールバックURL登録の手順を記載する
  - Apple: Service ID作成→ドメイン検証→Return URL登録→.p8秘密鍵ダウンロードの手順を記載する（秘密鍵は再ダウンロード不可の注意書きを含む）
  - X: OAuth 2.0有効化→コールバックURL登録の手順を記載する
  - 取得クレデンシャルと対応する環境変数名のマッピング表を記載する
  - 本番・ステージング環境では別アプリを作成する必要がある旨を明記する
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

---

- [ ] 10. ユニットテストとインテグレーションテストを実装する
- [ ] 10.1 (P) 各 Strategy の unit テストを実装する
  - `LineStrategy.validate()` が LINE プロフィールを正しく `LineStrategyUser` に変換することをテストする
  - `AppleStrategy.validate()` を email あり・なし（2回目以降）の両パターンでテストする
  - `XStrategy.validate()` が X プロフィールを正しく `XStrategyUser` に変換することをテストする
  - ConfigService の getter が未設定時に適切なエラーを返すことをテストする（Apple privateKey の `\n` 変換を含む）
  - _Requirements: 1.4, 2.4, 2.5, 3.4_

- [ ] 10.2 (P) OAuthService の unit テストを実装する
  - `lineLogin`・`appleLogin`・`xLogin` の既存ユーザー・新規ユーザー分岐をテストする
  - `appleRegisterWithInvitation` の `fallbackEmail` あり・なしの両パターンをテストする
  - 無効な招待コード時に 400 エラーがスローされることをテストする
  - `handleOAuthLogin` がプロバイダーフィールド（`lineId`・`appleId`・`xId`）を正しく使用することをテストする
  - _Requirements: 1.2, 1.3, 2.2, 2.3, 2.4, 3.2, 3.3, 5.1, 5.2, 5.3_

- [ ] 10.3 AuthController のインテグレーションテストを実装する
  - `POST /auth/line/register-with-invitation` の有効・無効な招待コードをテストする
  - `POST /auth/apple/callback` が POST リクエストを正しく処理することをテストする
  - `POST /auth/apple/register-with-invitation` で `fallbackEmail` を含むリクエストをテストする
  - `GET /auth/x/callback` のコールバック処理と JWT 発行をテストする
  - Prisma の `lineId`・`appleId`・`xId` ユニーク制約違反時のエラー処理をテストする
  - _Requirements: 1.5, 1.6, 2.6, 2.7, 3.5, 3.6, 4.4, 5.2_
