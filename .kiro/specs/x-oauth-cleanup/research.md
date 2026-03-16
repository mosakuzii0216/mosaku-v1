# Research Log: x-oauth-cleanup

## Discovery Type: Light（既存システムのコード削除）

## Summary

X/Twitter OAuth の残留コードは audit.md で報告された4ファイルよりも広範囲に存在する。`useOAuth.ts` のプロバイダー設定・`AuthContext.tsx` のインターフェース・`AuthForm.tsx` の UI ロジックまで連鎖している。削除は純粋なコード削除であり、新ロジックは不要。ビルド通過を最終確認とする。

## Investigation Log

### 影響ファイル一覧

**フロントエンド（削除必要）:**

- `frontend/src/utils/oauthAuth.ts` — `XAuthUtilsClass`, `xAuthUtils`, `XAuthUtils` export, `getXConsumerKey` import
- `frontend/src/utils/auth.ts` L250-270 — `xRegisterWithInvitation()` メソッド
- `frontend/src/utils/env.ts` L155+ — `getXConsumerKey()` 関数
- `frontend/src/constants/features.ts` — `OAUTH_X` フラグ
- `frontend/src/hooks/useOAuth.ts` — `OAuthProvider` 型から `'x'` 削除、`OAUTH_PROVIDERS.x` 削除、`XAuthUtils` import 削除
- `frontend/src/contexts/AuthContext.tsx` — `xLogin`, `xRegisterWithInvitation` の型・実装・context value 削除
- `frontend/src/components/auth/AuthForm.tsx` — `xInvite` モード削除
- `frontend/src/components/ui/OAuthLoginButton.tsx` — `xLogin` の destructure と X ボタン設定削除

**バックエンド（削除必要）:**

- `backend/src/config/features.config.ts` — `OAUTH_X` フラグ

### リスク評価

- **データ損失リスク**: なし（コード削除のみ）
- **Google/GitHub OAuth への影響**: `useOAuth.ts` の `OAuthProvider` 型から `'x'` を削除するが、ループ処理（`Object.entries(OAUTH_PROVIDERS)`）は残存するプロバイダーで引き続き機能する
- **TypeScript 型安全性**: `OAuthProvider` から `'x'` を削除すると、`'x'` を渡していた箇所がコンパイルエラーになる。すべて削除済みであることをビルドで確認する
