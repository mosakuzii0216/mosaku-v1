# Implementation Plan

## Tasks

- [ ] 1. ユーティリティ層の X/Twitter コードを削除する
- [x] 1.1 (P) oauthAuth.ts から XAuthUtils クラスと関連コードを削除する
  - `XAuthUtilsClass` クラス定義を削除する
  - `xAuthUtils` インスタンス変数を削除する
  - `XAuthUtils` エクスポートオブジェクトを削除する
  - `getXConsumerKey` の import を削除する
  - _Requirements: 1.2_

- [x] 1.2 (P) auth.ts から xRegisterWithInvitation メソッドを削除する
  - `AuthAPI` クラスの `xRegisterWithInvitation()` メソッドを削除する
  - _Requirements: 1.1_

- [x] 1.3 (P) env.ts から getXConsumerKey 関数を削除する
  - `getXConsumerKey()` 関数を削除する
  - _Requirements: 1.2_

- [ ] 2. フィーチャーフラグの OAUTH_X を削除する
- [x] 2.1 (P) フロントエンドの OAUTH_X フィーチャーフラグを削除する
  - `frontend/src/constants/features.ts` から `OAUTH_X` エントリとコメントを削除する
  - _Requirements: 1.4_

- [x] 2.2 (P) バックエンドの OAUTH_X フィーチャーフラグを削除する
  - `backend/src/config/features.config.ts` から `OAUTH_X` エントリとコメントを削除する
  - _Requirements: 2.1, 2.2_

- [ ] 3. フック・コンテキスト層の X/Twitter 参照を削除する
- [x] 3.1 useOAuth.ts から X プロバイダー設定を削除する
  - `OAuthProvider` 型から `'x'` を削除して `'google' | 'github'` のみにする
  - `XAuthUtils` の import を削除する
  - `OAuthProviderConfig.utils` の union 型から `typeof XAuthUtils` を削除する
  - `OAUTH_PROVIDERS` から `x` エントリを削除する
  - タスク 1.1 の完了後に実施すること（`XAuthUtils` 削除後）
  - _Requirements: 1.2, 3.1, 3.2_

- [x] 3.2 AuthContext.tsx から xLogin と xRegisterWithInvitation を削除する
  - `AuthActions` インターフェースから `xLogin` と `xRegisterWithInvitation` を削除する
  - `xLogin` の `useCallback` 実装を削除する
  - `xRegisterWithInvitation` の `useCallback` 実装を削除する
  - context value オブジェクトから `xLogin`, `xRegisterWithInvitation` を削除する
  - タスク 3.1 の完了後に実施すること（`OAuthProvider` 型変更後）
  - _Requirements: 1.1, 3.1_

- [ ] 4. UI コンポーネント層の X/Twitter 参照を削除する
- [x] 4.1 (P) AuthForm.tsx から xInvite モードを削除する
  - `AuthMode` 型から `'xInvite'` を削除する
  - providers 配列から `{ key: 'pendingXUser', mode: 'xInvite' }` エントリを削除する
  - ハンドラーマップ・storageKey マップ・`case 'xInvite'` 条件分岐を削除する
  - `xRegisterWithInvitation` の destructure を削除する
  - タスク 3.2 の完了後に実施すること
  - _Requirements: 1.1_

- [x] 4.2 (P) OAuthLoginButton.tsx から X ボタン設定を削除する
  - `xLogin` の destructure を削除する
  - X ボタンの provider 設定オブジェクトを削除する
  - タスク 3.2 の完了後に実施すること
  - _Requirements: 1.2_

- [ ] 5. ビルド検証で全削除が型安全であることを確認する
- [x] 5.1 フロントエンドのビルドが型エラーなしでパスすることを確認する
  - `cd frontend && npm run build` を実行してエラーがないことを確認する
  - X/Twitter 参照の残存があればコンパイルエラーで検出し修正する
  - _Requirements: 1.3, 3.3_

- [x] 5.2 バックエンドのビルドが型エラーなしでパスすることを確認する
  - `cd backend && npm run build` を実行してエラーがないことを確認する
  - _Requirements: 2.2, 3.3_
