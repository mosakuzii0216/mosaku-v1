# Requirements Document

## Introduction

Mosaku は招待制アクセスを採用しており、新規ユーザー登録には有効な招待コードが必要である。現在、メール/パスワード登録における招待コード検証ロジックは `AuthController` に直接実装されており、`AuthService.register` は招待コードパラメータ（`_invitationCode`）を受け取りながらも未使用（`_` プレフィックス）のままになっている。一方、`OAuthService.handleOAuthRegistrationWithInvitation` は招待コードの検証・使用をサービス層内で完結させており、コントローラー側に招待ロジックが漏れていない。

本リファクタリングは、`AuthService.register` に招待コード検証ロジックを移動し、`OAuthService` と同じサービス層責務パターンに統一することを目的とする。これにより、招待コード検証がサービス層に一元化され、コントローラーの責務がリクエスト処理・レスポンス整形に限定される。

## Requirements

### Requirement 1: AuthService への招待コード検証統合

**Objective:** バックエンド開発者として、`AuthService.register` が招待コード検証を内部で処理できるようにしたい。そうすることで、コントローラーが招待ロジックを直接扱わずに済み、`OAuthService` と同じサービス層パターンに揃えられる。

#### Acceptance Criteria

1. When `AuthService.register` が呼び出され、`invitationCode` が渡されたとき、the AuthService shall `InvitationService.verifyInvitation` を呼び出して招待コードの有効性を検証する
2. When 招待コードの検証が成功したとき、the AuthService shall ユーザーを作成したうえで `InvitationService.useInvitation` を呼び出して招待コードの使用回数をインクリメントする
3. If `invitationCode` が無効（存在しない・期限切れ・使用上限超過）である場合、the AuthService shall ユーザー作成を行わずに適切なエラーをスローする
4. If `invitationCode` が存在しない・期限切れ・使用上限超過である場合、the AuthService shall それぞれ `INVALID_CODE`・`EXPIRED`・`MAX_USES_REACHED` に対応するエラーコードで例外を発生させる
5. When 登録対象のメールアドレスが管理者メール（`ConfigService.isAdminEmail`）と一致するとき、the AuthService shall 招待コード検証をスキップしてユーザーを `ADMIN` ロールで作成する

### Requirement 2: AuthModule への InvitationModule 依存追加

**Objective:** バックエンド開発者として、`AuthModule` が `InvitationModule` を正しくインポートするようにしたい。そうすることで、`AuthService` が `InvitationService` を DI コンテナ経由で受け取れるようになる。

#### Acceptance Criteria

1. The AuthModule shall `InvitationModule` を `imports` 配列に含め、`InvitationService` を利用可能にする
2. The AuthService shall コンストラクタで `InvitationService` を依存注入として受け取る
3. The AuthModule shall 既存の依存関係（`JwtTokenService`・`ConfigService`・`PrismaService`）を引き続き正常に解決できる

### Requirement 3: AuthController からの招待コードロジック除去

**Objective:** バックエンド開発者として、`AuthController.register` が招待コードロジックをサービスに委譲するようにしたい。そうすることで、コントローラーの責務がリクエスト処理・レスポンス整形のみに限定される。

#### Acceptance Criteria

1. When `POST /auth/register` リクエストを受けたとき、the AuthController shall `InvitationService` を直接呼び出さずに `AuthService.register` のみを呼び出す
2. The AuthController shall `InvitationService` への直接依存（コンストラクタ注入・メソッド呼び出し）を `register` エンドポイント処理から排除する
3. When `AuthService.register` がエラーをスローしたとき、the AuthController shall そのエラーを適切にハンドリングしてクライアントに伝播させる

### Requirement 4: 既存テストの更新と新規テスト追加

**Objective:** バックエンド開発者として、リファクタリング後も `AuthService.register` の招待コード検証ロジックが単体テストでカバーされるようにしたい。そうすることで、リグレッションを防ぎ、振る舞いが明文化される。

#### Acceptance Criteria

1. When `AuthService.register` の単体テストを実行したとき、the AuthService shall 有効な招待コードでの正常登録・無効コードでのエラー・期限切れコードでのエラー・使用上限超過コードでのエラーの各シナリオがテストされる
2. When 管理者メールで登録したとき、the AuthService shall 招待コードなしでもユーザーが作成されることをテストで検証できる
3. The AuthService spec shall `InvitationService` をモックし、`verifyInvitation` と `useInvitation` の呼び出し順序を検証する
4. If ユーザー作成が失敗した場合、the AuthService shall `useInvitation` が呼び出されないことをテストで保証する
