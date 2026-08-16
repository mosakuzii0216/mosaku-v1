# Gap Analysis: react-router-v7-migration

## 現状調査

### React Router 使用ファイル一覧

| ファイル                                              | 使用 API                           | 変更リスク               |
| ----------------------------------------------------- | ---------------------------------- | ------------------------ |
| `frontend/src/App.tsx`                                | `BrowserRouter`, `Routes`, `Route` | 中（ルーターの初期化点） |
| `frontend/src/components/auth/AuthCallback.tsx`       | `useNavigate`                      | 低                       |
| `frontend/src/components/auth/AuthForm.tsx`           | `useSearchParams`                  | 低                       |
| `frontend/src/components/auth/PasswordReset.tsx`      | `useNavigate`                      | 低                       |
| `frontend/src/components/ui/Header.tsx`               | `Link`                             | 低                       |
| `frontend/src/components/admin/InvitationManager.tsx` | `Link`                             | 低                       |

### 現在のパッケージ状態（重要な発見）

```json
"dependencies": {
  "react-router-dom": "^6.30.1"
},
"devDependencies": {
  "@types/react-router-dom": "^5.3.3"  // ⚠️ v5 の型! v6 に対応していない
}
```

**重大な発見**: `@types/react-router-dom@^5.3.3` は React Router **v5** の型定義。現在 v6 を使っているにもかかわらず v5 の型で型チェックされている。v6 自体は型定義を内包しているため、この devDep は実質的に不要かつ誤った型を提供している可能性がある。

### ルーティング構成（App.tsx）

```
BrowserRouter
└── Routes
    ├── /auth/callback    → AuthCallback（useNavigate で /auth にリダイレクト）
    ├── /auth/reset-password → PasswordReset（useNavigate で / に遷移）
    ├── /admin/invitations → InvitationManager（AuthGuard ラップ）
    └── /*               → AppContent（AuthGuard ラップ）
```

- ローダー・アクション（Data Router 機能）は**未使用**
- スプラットルート `/*` は `AppContent` で受けており、内部は Zustand の `useViewStore` でビュー切り替え（URLパスを使わない）
- `future` prop は現在**未設定**

### v6 → v7 の主要変更点

| 変更点                                                          | 現在のコードへの影響                      |
| --------------------------------------------------------------- | ----------------------------------------- |
| `react-router-dom` → `react-router` へのパッケージ統合          | 全 import を変更（互換 re-export あり）   |
| `v7_startTransition` flag                                       | BrowserRouter に追加するだけ              |
| `v7_relativeSplatPath` flag                                     | `/*` スプラットルートに影響する可能性あり |
| `@types/react-router-dom` 不要（型内包）                        | devDep 削除                               |
| API（useNavigate, Link, useSearchParams）は維持                 | 変更不要                                  |
| `createBrowserRouter` が推奨だが `BrowserRouter` も継続サポート | 必須ではない                              |

---

## 要件フィージビリティ分析

### Requirement 1: v6 future flags の有効化

- **現状**: `BrowserRouter` に `future` prop なし
- **ギャップ**: `App.tsx:45` の `<Router>` タグに `future` prop を追加するだけ
- **複雑度**: 低。1行の変更で完結

### Requirement 2: v7 パッケージ更新

- **現状**: `react-router-dom@^6.30.1`、`@types/react-router-dom@^5.3.3`（v5型！）
- **ギャップ**:
  - `package.json` の更新
  - `@types/react-router-dom` の削除
  - 全ファイルの import パス変更（`react-router-dom` → `react-router`、または互換 re-export を活用）
- **注意点**: v7 では `react-router-dom` も互換用に残っているが、長期的には `react-router` に移行推奨

### Requirement 3: 破壊的変更への対応

- **useNavigate**: API 変更なし。両ファイルとも単純な `navigate('/path')` 呼び出しのみ
- **useSearchParams**: API 変更なし。読み取り専用の単純な使用
- **Link**: API 変更なし
- **`v7_relativeSplatPath`**: `/*` スプラット内でのリンクに影響する可能性。現在 `Header.tsx` の `Link` は `/admin/invitations` という絶対パスを使用しているため影響なし
- **ギャップ**: 実質的な破壊的変更なし。型定義の整合性確認が主

### Requirement 4: 段階移行の安全性

- **現状**: CI/CD なし（ローカル `npm run build` と `npm run lint`）
- **ギャップ**: 各ステップで `npm run build` が通ることを確認すれば対応可能
- **複雑度**: 低

### Requirement 5: 品質維持

- **現状**: TypeScript strict mode 有効。`any` 禁止
- **ギャップ**: `@types/react-router-dom@^5.3.3`（v5型）を削除することで、v7 内包型との整合性が取れる
- **リスク**: v5 型で通っていたコードが v7 型でエラーになる可能性 → 要確認

---

## 実装アプローチの選択肢

### Option A: 段階移行（future flags → v7 アップグレード）【推奨】

**変更範囲**:

1. `App.tsx` の `<BrowserRouter>` に `future` フラグを追加
2. ビルド確認（Step 1 コミット）
3. `package.json` を v7 に更新、`@types/react-router-dom` 削除
4. 全ファイルの import を `react-router-dom` → `react-router` に変更（または v7 の re-export 維持確認）
5. ビルド・リント確認（Step 2 コミット）

**利点**:

- 各ステップで問題を切り離して特定できる
- 要件で指定された段階移行に合致

**欠点**:

- 2 コミット分の作業が必要

### Option B: 直接 v7 アップグレード（future flags スキップ）

`react-router-dom@v6` の API 使用量が少ないため、future flags を挟まず直接 v7 に上げる。

**利点**:

- 変更量が少なく済む（1コミット）
- future flags フェーズが不要

**欠点**:

- 問題発生時の原因切り分けが困難
- 要件 1・4 を満たさない

### Option C: createBrowserRouter への移行（Data Router）

v7 推奨の `createBrowserRouter` を採用し、将来のローダー・アクション追加に備える。

**利点**:

- v7 のベストプラクティスに沿う
- 将来の SSR 対応・ローダー追加が容易

**欠点**:

- 現在のアーキテクチャ（Zustand でビュー管理）との相性が複雑
- 変更範囲が大きく、スコープオーバー
- 現時点でローダー等のメリットがない

---

## 複雑度・リスク評価

| 評価軸     | 判定        | 根拠                                                                                                              |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **工数**   | S（1〜3日） | 変更ファイルは最大 6 ファイル。API 互換性が高く、主に import 変更とパッケージ更新                                 |
| **リスク** | 低          | 使用 API（BrowserRouter, Link, useNavigate, useSearchParams）はすべて v7 で維持される。破壊的変更の実質的影響なし |

---

## 設計フェーズへの推奨事項

### 推奨アプローチ

**Option A（段階移行）** を採用する。要件に合致し、リスクを最小化できる。

### 設計フェーズで確認すべき事項

1. **React Router v7 の import パス**: `react-router-dom` の re-export が v7 でどの程度維持されるか（`react-router` への移行が必須か任意か）
2. **`v7_relativeSplatPath` の影響範囲**: `/*` スプラット内の `Link` が絶対パスのみであることを確認（現状は問題なさそうだが設計で明確化）
3. **`@types/react-router-dom@^5.3.3` の削除後の型エラー**: v5 型が v6 コードのどこかを誤魔化している可能性。ビルドで確認が必要
4. **v7 の `future` prop の型定義**: v7 自体には future flags が不要（全てデフォルト）。v6 での有効化ステップの意義を設計で明確化

### 発見された既存バグ

- `@types/react-router-dom@^5.3.3` は v5 の型定義。v6 を使用しているプロジェクトで v5 型をインストールしているのは誤り。移行時に必ず削除すること。
