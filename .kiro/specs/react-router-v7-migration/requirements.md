# Requirements Document

## Project Description (Input)

React Router v6 から v7 への移行（future flags を使った後方互換モードで段階移行）

## Introduction

本仕様は、Mosaku フロントエンド（React 19 + Vite 6）が現在使用している `react-router-dom@^6.30.1` を React Router v7 へ段階的に移行するための要件を定義する。
移行は「future flags を v6 上で有効化 → 動作確認 → v7 へパッケージ更新 → 破壊的変更対応」という順序で安全に進める。
既存ルーティング（`/auth/callback`、`/auth/reset-password`、`/admin/invitations`、`/*`）は移行後も同一の動作を維持しなければならない。

## Requirements

### Requirement 1: v6 future flags の有効化

**Objective:** As a フロントエンド開発者, I want v6 の BrowserRouter に全 v7 future flags を設定できる, so that v7 への移行前にランタイムの挙動変化を検出できる

#### Acceptance Criteria

1. When `BrowserRouter` を初期化するとき, the Migration System shall `future` prop に `v7_startTransition`・`v7_relativeSplatPath` を含む全 v7 future flags を設定する
2. When future flags を有効化した状態でアプリを起動するとき, the Migration System shall ブラウザコンソールに React Router の deprecation 警告を出力しない
3. If future flags のいずれかが型定義に存在しない場合, the Migration System shall TypeScript コンパイルエラーを発生させずに型安全に設定できる
4. The Migration System shall 既存の 4 ルート（`/auth/callback`、`/auth/reset-password`、`/admin/invitations`、`/*`）を future flags 有効化後も同一パスでレンダリングする

### Requirement 2: react-router-dom v7 へのパッケージ更新

**Objective:** As a フロントエンド開発者, I want `react-router-dom` を v7 系にアップグレードできる, so that v7 の正式 API と最新バグ修正を利用できる

#### Acceptance Criteria

1. When `package.json` の `react-router-dom` バージョンを v7 系に更新するとき, the Migration System shall `npm install` が依存関係の競合なく完了する
2. When v7 に更新した後, the Migration System shall `@types/react-router-dom` を削除し v7 同梱の型定義を使用する（v7 は型定義を内包するため）
3. The Migration System shall `npm run build` が TypeScript エラーゼロで完了する
4. If v7 で削除された API（例: `<BrowserRouter>` の代わりの `createBrowserRouter`）を使用している場合, the Migration System shall v7 推奨 API への置き換えを完了する

### Requirement 3: 破壊的変更への対応

**Objective:** As a フロントエンド開発者, I want v6 から v7 の破壊的変更を洗い出して修正できる, so that 移行後もアプリが正常に動作する

#### Acceptance Criteria

1. When `useNavigate` を使用しているコンポーネント（`AuthCallback.tsx`・`PasswordReset.tsx`）をレンダリングするとき, the Migration System shall v7 の `useNavigate` API で正常にページ遷移する
2. When `useSearchParams` を使用している `AuthForm.tsx` をレンダリングするとき, the Migration System shall v7 の `useSearchParams` API でクエリパラメータを正常に読み取る
3. When `<Link>` を使用している `Header.tsx`・`InvitationManager.tsx` をレンダリングするとき, the Migration System shall v7 の `Link` コンポーネントで正常にルーティングする
4. If v7 で相対パス解決ルール（`v7_relativeSplatPath`）が変更された場合, the Migration System shall `/*` スプラットルート配下のリンクが正しいパスに解決される
5. The Migration System shall `AuthGuard` ラッパーを持つルートが v7 移行後も認証状態に応じて正しくレンダリング・リダイレクトする

### Requirement 4: 段階移行の安全性確保

**Objective:** As a フロントエンド開発者, I want 段階移行の各ステップでアプリの動作を確認できる, so that 問題が発生しても原因を特定しやすくする

#### Acceptance Criteria

1. The Migration System shall 移行を「Step 1: future flags 有効化」→「Step 2: v7 パッケージ更新」→「Step 3: 破壊的変更修正」の順で個別にコミット可能な単位に分割する
2. When 各ステップを完了するとき, the Migration System shall `npm run build`（TypeScript チェック + Vite ビルド）がエラーなく通過する
3. While v7 移行作業中, the Migration System shall `npm run lint` が既存の ESLint ルール違反ゼロを維持する
4. If 移行中にルーティングの動作差異が発見された場合, the Migration System shall 既存の動作に合わせた修正を加える（v7 の新挙動を強制しない）

### Requirement 5: 移行後の品質維持

**Objective:** As a フロントエンド開発者, I want 移行後もコードベースの品質基準を維持できる, so that 移行がテクニカルデットを生まない

#### Acceptance Criteria

1. The Migration System shall TypeScript strict mode（`noImplicitAny`・`strictNullChecks`）を満たす型付きコードを維持する
2. The Migration System shall `any` 型を新たに導入しない
3. When v7 移行が完了したとき, the Migration System shall `package.json` から `@types/react-router-dom` を削除し不要な型パッケージを残さない
4. The Migration System shall 移行に伴う変更が `frontend/src/` ディレクトリ内に限定され、バックエンドコードを変更しない
