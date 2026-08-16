# Implementation Plan

- [ ] 1. AuthService に招待コード検証ロジックを組み込む
- [x] 1.1 AuthModule の DI 設定を確認し、AuthService コンストラクタに InvitationService を注入する
  - `AuthModule.providers` に `InvitationService` がすでに直接登録されていることを確認する（`InvitationModule` のインポートは循環依存を引き起こすため追加しない）
  - `AuthService` のコンストラクタに `InvitationService` の依存注入パラメータを追加する
  - 既存の `JwtTokenService`・`ConfigService`・`PrismaService` への依存が引き続き正常に解決されることを確認する
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 1.2 AuthService.register に招待コード検証と使用回数インクリメントを実装する
  - 管理者メールの判定を招待コード検証より前に行い、管理者の場合は `ADMIN` ロールで即座にユーザー作成へ進む（招待コード検証をスキップ）
  - 通常ユーザーの場合は `InvitationService.verifyInvitation` を呼び出して招待コードの有効性を検証する
  - 招待コードが無効（存在しない・期限切れ・使用上限超過）の場合は、ユーザー作成を行わずそのまま例外を伝播させる
  - 招待コード検証成功後にユーザーを作成し、作成成功後に限り `InvitationService.useInvitation` を呼び出す（作成失敗時は `useInvitation` が呼ばれない）
  - `_invitationCode` パラメータの `_` プレフィックスを除去して実際に使用する形に変更する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. AuthController の招待コードロジックを削除して AuthService に委譲する
  - `AuthController.register` 内の `invitationService.verifyInvitation` および `invitationService.useInvitation` の直接呼び出しを削除する
  - `authService.register(email, password, name, invitationCode)` の呼び出しのみを残す形に `register` エンドポイントを簡略化する
  - `AuthController` のコンストラクタから `InvitationService` の依存注入パラメータを削除する
  - `AuthService.register` がスローする例外をキャッチし、クライアントに適切にエラーを伝播させる既存のエラーハンドリングを維持する
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. (P) AuthService のテストを拡充して招待コード検証シナリオを網羅する
- [x] 3.1 テストモジュールに InvitationService モックを追加する
  - `auth.service.spec.ts` の `TestingModule` セットアップに `mockInvitationService` を追加する（`verifyInvitation` と `useInvitation` を `jest.fn()` でモック）
  - `beforeEach` で `jest.clearAllMocks()` によるモッククリアが `InvitationService` モックにも適用されることを確認する
  - 既存のテストが引き続きパスすることを確認する（`register` の既存テストはモック追加により `InvitationService` の呼び出し検証が増える）
  - _Requirements: 4.3_

- [x] 3.2 各招待コードシナリオのテストケースを実装する
  - 有効な招待コードでの正常登録：`verifyInvitation` 成功・ユーザー作成後に `useInvitation` が呼ばれることを検証する
  - 無効な招待コード（`INVALID_CODE`）：`verifyInvitation` が例外をスローし、ユーザー作成が行われないことを検証する
  - 期限切れ招待コード（`EXPIRED`）：`verifyInvitation` が例外をスローし、ユーザー作成が行われないことを検証する
  - 使用上限超過（`MAX_USES_REACHED`）：`verifyInvitation` が例外をスローし、ユーザー作成が行われないことを検証する
  - 管理者メールでの登録（招待コードなし）：`verifyInvitation` が呼ばれず、`ADMIN` ロールでユーザーが作成されることを検証する
  - ユーザー作成失敗時の `useInvitation` 非呼び出し：`prisma.user.create` が例外をスローした場合に `useInvitation` が呼ばれないことを検証する
  - _Requirements: 4.1, 4.2, 4.4_
