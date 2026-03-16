# Requirements Document

## Introduction

コードベースには X/Twitter OAuth 認証の実装が途中で放棄された残留コードが存在する。バックエンドに `/auth/x` エンドポイントは存在しないが、フロントエンドからは `xRegisterWithInvitation()` や `XAuthUtilsClass` が呼び出しを試み、500エラーを引き起こす可能性がある。また、両エンド（BE/FE）に `OAUTH_X` フィーチャーフラグが残存している。これらの未実装コードをすべて削除し、コードベースをクリーンな状態にする。

## Requirements

### Requirement 1: フロントエンドの X/Twitter 認証コード削除

**Objective:** 開発者として、未実装の X/Twitter 認証コードをフロントエンドから削除したいので、存在しないエンドポイントへの参照を排除してランタイムエラーを防ぎたい。

#### Acceptance Criteria

1. The システム shall `frontend/src/utils/auth.ts` から `xRegisterWithInvitation()` 関数を削除する。
2. The システム shall `frontend/src/utils/oauthAuth.ts` から `XAuthUtilsClass` および `/auth/x` へのリダイレクト処理を削除する。
3. If X/Twitter 認証に関連するコードが削除された場合、the システム shall TypeScript のコンパイルエラーを発生させずにビルドを成功させる。
4. The システム shall `frontend/src/constants/features.ts` から `OAUTH_X` フィーチャーフラグを削除する。

---

### Requirement 2: バックエンドの X/Twitter フィーチャーフラグ削除

**Objective:** 開発者として、バックエンドの未使用フィーチャーフラグを削除したいので、コードの意図が明確になりメンテナンスコストを下げたい。

#### Acceptance Criteria

1. The システム shall `backend/src/config/features.config.ts` から `OAUTH_X` フィーチャーフラグを削除する。
2. If `OAUTH_X` フラグが削除された場合、the システム shall `OAUTH_X` を参照している箇所がないことを TypeScript コンパイルで検証できる。

---

### Requirement 3: X/Twitter 関連コード削除後の安全性確保

**Objective:** 開発者として、削除後もアプリケーションが正常に動作することを確認したいので、既存の Google/GitHub OAuth 機能が影響を受けないことを保証したい。

#### Acceptance Criteria

1. When X/Twitter 関連コードを削除した後、the システム shall Google OAuth および GitHub OAuth の認証フローに影響を与えない。
2. The システム shall X/Twitter 以外の OAuth プロバイダー（Google、GitHub）に関するコードを変更しない。
3. When ビルドを実行したとき、the システム shall バックエンドおよびフロントエンドの両方でコンパイルエラーなしにビルドが完了する。
