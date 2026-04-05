# Implementation Plan

## Task Format Template

- [ ] 1. Step 1 — v6 future flags を有効化してコミットする
- [x] 1.1 BrowserRouter に v7 future flags を追加する
  - `App.tsx` の `BrowserRouter`（`<Router>`）に `future` prop を追加し、`v7_startTransition: true` と `v7_relativeSplatPath: true` を設定する
  - 既存の 4 ルート定義（`/auth/callback`・`/auth/reset-password`・`/admin/invitations`・`/*`）は変更しない
  - `future` prop の型が TypeScript コンパイルエラーを出さないことを確認する（`react-router-dom@6` の `Partial<FutureConfig>` 型で通ること）
  - `any` 型を導入せず strict mode を維持する
  - 変更は `frontend/src/` 内のみ（バックエンドには一切触れない）
  - _Requirements: 1.1, 1.3, 4.1, 4.4, 5.1, 5.2, 5.4_

- [x] 1.2 Step 1 完了後のビルド・lint・コンソール確認を行う
  - `cd frontend && npm run build` を実行して TypeScript エラーゼロ・Vite ビルド成功を確認する
  - `cd frontend && npm run lint` を実行して ESLint 警告・エラーがゼロであることを確認する
  - ブラウザで起動し、コンソールに React Router の deprecation 警告が出ないことを確認する
  - `/auth/callback`・`/auth/reset-password`・`/admin/invitations`・`/` の 4 ルートが future flags 有効化後も同一パスでレンダリングされることを確認する
  - スプラットルート（`/*`）配下の絶対パスリンクが正しく解決されることを確認する
  - 確認後、Step 1 分として独立コミットを作成する
  - _Requirements: 1.2, 1.4, 3.4, 4.2, 4.3_

- [ ] 2. Step 2 — v7 へパッケージ更新・import 変更・型整理をしてコミットする
- [x] 2.1 (P) パッケージを react-router v7 に入れ替える
  - `frontend/` で `npm uninstall react-router-dom` を実行し `react-router-dom` を削除する
  - `npm install react-router@latest` を実行して `react-router` v7 をインストールする
  - `npm uninstall -D @types/react-router-dom` を実行して不要な型パッケージを削除する
  - `package-lock.json` に依存競合がないことを確認する（React 19 は v7 の要件を満たすため競合しないはず）
  - _Requirements: 2.1, 2.2, 4.1, 5.3_

- [x] 2.2 (P) 全 6 ファイルの import パスを react-router に変更する
  - `src/App.tsx` の `from 'react-router-dom'` を `from 'react-router'` に変更する
  - `src/components/auth/AuthCallback.tsx` の import を `from 'react-router'` に変更する（`useNavigate` は v7 で維持されている）
  - `src/components/auth/AuthForm.tsx` の import を `from 'react-router'` に変更する（`useSearchParams` は v7 で維持されている）
  - `src/components/auth/PasswordReset.tsx` の import を `from 'react-router'` に変更する（`useNavigate` は v7 で維持されている）
  - `src/components/ui/Header.tsx` の import を `from 'react-router'` に変更する（`Link` は v7 で維持されている）
  - `src/components/admin/InvitationManager.tsx` の import を `from 'react-router'` に変更する（`Link` は v7 で維持されている）
  - import 文以外のロジック・JSX は一切変更しない
  - `any` 型を導入せず strict mode を維持する
  - 変更は `frontend/src/` 内のみ（バックエンドには一切触れない）
  - _Requirements: 2.4, 3.1, 3.2, 3.3, 4.4, 5.1, 5.2, 5.4_

- [x] 2.3 Step 2 完了後のビルド・lint・動作確認を行う
  - `cd frontend && npm run build` を実行して TypeScript エラーゼロ・Vite ビルド成功を確認する
  - `cd frontend && npm run lint` を実行して ESLint 警告・エラーがゼロであることを確認する
  - ブラウザで `/auth/callback` にアクセスして `/auth` へのリダイレクトが正常に動作することを確認する
  - `/auth/reset-password` でパスワード変更フォームが表示されることを確認する
  - `/admin/invitations` で `AuthGuard` が認証状態に応じて正しくレンダリング・リダイレクトすることを確認する
  - `/` で `MobileLayout` / `DesktopLayout` が正常表示されることを確認する
  - `AuthForm.tsx` で `?error=invitation_required` クエリパラメータが正常に読み取られることを確認する
  - 確認後、Step 2 分として独立コミットを作成する
  - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.5, 4.2, 4.3_
