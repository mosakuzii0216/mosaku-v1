# Design Document: x-oauth-cleanup

## Overview

本機能は、未実装のまま放置された X/Twitter OAuth 認証コードをコードベース全体から削除する。存在しない `/auth/x` バックエンドエンドポイントへの参照がランタイム 500 エラーを引き起こす可能性があるため、フロントエンド・バックエンドにまたがる全ての X/Twitter 関連コードを除去する。

Google/GitHub OAuth の既存実装は一切変更しない。

### Goals

- X/Twitter OAuth に関連するすべてのコード・型・設定を削除する
- 削除後も Google/GitHub OAuth が正常に動作することを TypeScript ビルドで確認する
- `OAuthProvider` 型から `'x'` を排除し、型安全性を維持する

### Non-Goals

- Google/GitHub OAuth ロジックの変更
- 新しい OAuth プロバイダーの追加
- バックエンド `/auth/x` エンドポイントの実装

---

## Requirements Traceability

| Requirement | Summary                                   | Components                                                      |
| ----------- | ----------------------------------------- | --------------------------------------------------------------- |
| 1.1         | `xRegisterWithInvitation()` を削除        | `auth.ts`, `AuthContext.tsx`, `AuthForm.tsx`                    |
| 1.2         | `XAuthUtilsClass` と `/auth/x` 参照を削除 | `oauthAuth.ts`, `env.ts`, `useOAuth.ts`, `OAuthLoginButton.tsx` |
| 1.3         | ビルドが型エラーなしで成功                | ビルド検証                                                      |
| 1.4         | `OAUTH_X` フラグ（FE）を削除              | `features.ts`                                                   |
| 2.1         | `OAUTH_X` フラグ（BE）を削除              | `features.config.ts`                                            |
| 2.2         | `OAUTH_X` 参照なしをコンパイルで検証      | ビルド検証                                                      |
| 3.1         | Google/GitHub OAuth への無影響            | `useOAuth.ts`, `AuthContext.tsx`                                |
| 3.2         | Google/GitHub コードを変更しない          | 全削除対象ファイル                                              |
| 3.3         | BE/FE ビルド成功                          | ビルド検証                                                      |

---

## Architecture

### Existing Architecture Analysis

X/Twitter 参照は以下の依存チェーンで連鎖している:

```
oauthAuth.ts (XAuthUtilsClass)
  └── useOAuth.ts (OAUTH_PROVIDERS.x, OAuthProvider type)
        ├── AuthContext.tsx (xLogin, xRegisterWithInvitation)
        │     └── AuthForm.tsx (xInvite mode)
        └── OAuthLoginButton.tsx (xLogin)
auth.ts (xRegisterWithInvitation method)
  └── AuthContext.tsx (xRegisterWithInvitation)
env.ts (getXConsumerKey)
  └── oauthAuth.ts (import)
constants/features.ts (OAUTH_X)
backend/features.config.ts (OAUTH_X)
```

削除は依存関係の末端（`oauthAuth.ts`, `auth.ts`, `env.ts`）から起点ファイル（`AuthForm.tsx`, `OAuthLoginButton.tsx`）へ向けて実施する。

### Technology Stack

| Layer    | Choice / Version       | Role in Feature            |
| -------- | ---------------------- | -------------------------- |
| Frontend | TypeScript / React 19  | 型定義・コンポーネント修正 |
| Backend  | NestJS 11 / TypeScript | フラグ削除                 |

---

## Components and Interfaces

### Component Summary

| Component                    | Layer        | Intent                                                      | Req Coverage |
| ---------------------------- | ------------ | ----------------------------------------------------------- | ------------ |
| `oauthAuth.ts`               | FE Utility   | `XAuthUtilsClass` 削除                                      | 1.2          |
| `auth.ts`                    | FE Utility   | `xRegisterWithInvitation` 削除                              | 1.1          |
| `env.ts`                     | FE Utility   | `getXConsumerKey` 削除                                      | 1.2          |
| `useOAuth.ts`                | FE Hook      | `OAuthProvider` 型から `'x'` 削除、`OAUTH_PROVIDERS.x` 削除 | 1.2, 3.1     |
| `AuthContext.tsx`            | FE Context   | `xLogin`, `xRegisterWithInvitation` 削除                    | 1.1, 3.1     |
| `AuthForm.tsx`               | FE Component | `xInvite` モード削除                                        | 1.1          |
| `OAuthLoginButton.tsx`       | FE Component | X ボタン設定削除                                            | 1.2          |
| `constants/features.ts`      | FE Config    | `OAUTH_X` フラグ削除                                        | 1.4          |
| `backend/features.config.ts` | BE Config    | `OAUTH_X` フラグ削除                                        | 2.1          |

### Frontend / useOAuth.ts

**削除後の型定義:**

```typescript
// Before
export type OAuthProvider = 'google' | 'github' | 'x';

// After
export type OAuthProvider = 'google' | 'github';
```

`OAUTH_PROVIDERS` から `x` エントリを削除する。`OAuthProviderConfig.utils` の union 型から `typeof XAuthUtils` を削除する。

### Frontend / AuthContext.tsx

**削除対象インターフェースメンバー:**

```typescript
// 削除
xLogin: () => void;
xRegisterWithInvitation: (xUser: OAuthUserData, invitationCode: string) => Promise<void>;
```

context value オブジェクトからも `xLogin`, `xRegisterWithInvitation` を除去する。

### Frontend / AuthForm.tsx

**削除後の AuthMode 型:**

```typescript
// Before
type AuthMode = 'login' | 'signup' | 'resetPassword' | 'googleInvite' | 'githubInvite' | 'xInvite';

// After
type AuthMode = 'login' | 'signup' | 'resetPassword' | 'googleInvite' | 'githubInvite';
```

`pendingXUser` の providers 配列エントリ、`xInvite` のハンドラーマップ、`case 'xInvite'` の条件分岐を削除する。

---

## Testing Strategy

### TypeScript Compilation Check

- `cd frontend && npm run build` が型エラーなしで完了すること
- `cd backend && npm run build` が型エラーなしで完了すること
- `OAUTH_X`, `XAuthUtils`, `xRegisterWithInvitation`, `xLogin` への残存参照がないことをコンパイルで確認する

### Regression Check

- Google / GitHub OAuth フローに関連するコードが変更されていないことを確認する
