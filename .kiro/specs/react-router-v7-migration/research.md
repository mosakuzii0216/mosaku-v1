# Research & Design Decisions

---

## Summary

- **Feature**: `react-router-v7-migration`
- **Discovery Scope**: Extension（既存ライブラリのバージョン移行）
- **Key Findings**:
  - `react-router-dom` v7 は内部的に `react-router` への薄い re-export になっており、公式移行パスは `react-router-dom` をアンインストールして `react-router` をインストールし import を変更すること
  - `BrowserRouter`・`Routes`・`Route`・`Link`・`useNavigate`・`useSearchParams` はすべて v7 で API が維持されており、破壊的変更なし
  - Mosaku で使用している API は `BrowserRouter` 宣言型モードのみのため、`RouterProvider` 専用 future flags（`v7_fetcherPersist` 等）は適用対象外
  - `@types/react-router-dom@^5.3.3`（v5 型）が現在 devDependencies に残っており、v6 本体の型と競合している可能性がある

---

## Research Log

### React Router v7 パッケージ構成の変更

- **Context**: v7 で `react-router-dom` が廃止・統合される可能性を確認するため
- **Sources Consulted**: [React Router v6 → v7 公式 Upgrade Guide](https://raw.githubusercontent.com/remix-run/react-router/main/docs/upgrading/v6.md)
- **Findings**:
  - `react-router-dom` v7 は npm に存在し続けるが、中身は `react-router` の再エクスポートシム
  - `react-router-dom` の `index.ts` は実質的に `export * from "react-router"` のみ
  - 公式推奨: `react-router-dom` をアンインストールし `react-router` をインストール後、全 import を変更
  - ただし `react-router-dom` のまま使い続けても動作はする（シムのため）
- **Implications**: import 変更は必須ではないが、公式推奨に従い `react-router` に移行する設計とする

### v6 Future Flags の適用範囲

- **Context**: Mosaku の BrowserRouter 宣言型モードでどの future flags が必要かを確認するため
- **Sources Consulted**: React Router v7 CHANGELOG v7.0.0
- **Findings**:

  | Flag                             | 対象モード                     | Mosaku への適用 |
  | -------------------------------- | ------------------------------ | --------------- |
  | `v7_startTransition`             | BrowserRouter / RouterProvider | **対象**        |
  | `v7_relativeSplatPath`           | BrowserRouter / RouterProvider | **対象**        |
  | `v7_fetcherPersist`              | RouterProvider のみ            | 対象外          |
  | `v7_normalizeFormMethod`         | RouterProvider のみ            | 対象外          |
  | `v7_partialHydration`            | RouterProvider のみ            | 対象外          |
  | `v7_skipActionErrorRevalidation` | createBrowserRouter のみ       | 対象外          |

- **Implications**: Mosaku では `v7_startTransition` と `v7_relativeSplatPath` の 2 つのみ有効化が必要

### `v7_relativeSplatPath` の Mosaku への影響分析

- **Context**: `/*` スプラットルートを使用しているため、相対パス解決の変更が影響するか確認
- **Findings**:
  - このフラグは「マルチセグメントスプラット（`dashboard/*` のような複数パス区切りを含むスプラット）内での相対リンク解決」に影響する
  - Mosaku の `/*` はシングルセグメントスプラット
  - `Header.tsx` の `Link` は `/admin/invitations` という絶対パスを使用
  - `InvitationManager.tsx` の `Link` も絶対パスを使用
  - 相対パスリンクはいずれのコンポーネントにも存在しない
- **Implications**: `v7_relativeSplatPath` の影響はなし。ただし有効化してビルドとブラウザ動作を確認することで安全性を保証する

### `v7_startTransition` の Mosaku への影響分析

- **Context**: `React.lazy` をモジュールスコープ外で使用している場合にブレークするため確認
- **Findings**:
  - `v7_startTransition` は `React.useState` → `React.useTransition` にルーター状態更新を切り替える
  - `React.lazy` をコンポーネント内で呼び出している場合は壊れる（モジュールスコープに移動が必要）
  - Mosaku の App.tsx を確認: 全コンポーネントは static import で読み込まれており、`React.lazy` は使用なし
- **Implications**: 影響なし

### `@types/react-router-dom@^5.3.3` の問題

- **Context**: devDependencies に v5 型が存在することを発見
- **Findings**:
  - `@types/react-router-dom@^5.3.3` は React Router v5 の型定義パッケージ
  - React Router v6 から型は本体に内包（`react-router-dom` 自体に `.d.ts` が存在）
  - v5 型と v6 本体型が競合すると、型エラーが発生しないはずの箇所で通過したり、誤った型補完が起きる可能性
  - v7 移行時にこの devDep を削除することで型の整合性が確保される
- **Implications**: Step 2（v7 アップグレード）で必ず削除する

---

## Architecture Pattern Evaluation

| Option                           | 説明                                     | 強み                           | リスク / 制限                            | 採否                 |
| -------------------------------- | ---------------------------------------- | ------------------------------ | ---------------------------------------- | -------------------- |
| A: 段階移行（future flags → v7） | v6 で flags 有効化後に v7 アップグレード | 問題の切り分けが容易、要件合致 | 2 コミット分の作業                       | **採用**             |
| B: 直接 v7 アップグレード        | flags スキップして直接 v7 へ             | 変更量最小                     | 問題発生時の原因特定困難、要件不満足     | 不採用               |
| C: createBrowserRouter 移行      | Data Router アーキテクチャへ移行         | v7 ベストプラクティス          | スコープオーバー、Zustand との相性が複雑 | 不採用（スコープ外） |

---

## Design Decisions

### Decision: `react-router-dom` → `react-router` へ import パスを変更する

- **Context**: v7 では `react-router-dom` は薄い re-export シムとなり、公式は `react-router` への移行を推奨
- **Alternatives Considered**:
  1. `react-router-dom` のまま継続（動作はする）
  2. `react-router` に import 変更（公式推奨）
- **Selected Approach**: `react-router` に統一
- **Rationale**: 公式推奨に従うことで将来のサポート継続性を確保。変更対象は 6 ファイルで少ない
- **Trade-offs**: ✅ 長期的なメンテナビリティ向上 / ❌ 不要といえば不要な変更（シムでも動く）
- **Follow-up**: `npm run build` で型エラーがないことを確認

### Decision: `BrowserRouter` 宣言型モードを維持（createBrowserRouter に移行しない）

- **Context**: v7 では `createBrowserRouter` が推奨されるが、現在の Mosaku はビュー管理を Zustand で行っており Data Router の恩恵がない
- **Alternatives Considered**:
  1. `BrowserRouter` 維持（現状踏襲）
  2. `createBrowserRouter` + `RouterProvider` への移行
- **Selected Approach**: `BrowserRouter` 維持
- **Rationale**: ローダー・アクションを使用していない。Zustand がビュー状態管理の唯一の真実の源泉であり、Data Router は責務が重複する。スコープ内で完結する移行を優先
- **Trade-offs**: ✅ スコープ最小化、既存パターン維持 / ❌ v7 の新機能（ローダー等）は利用できない
- **Follow-up**: 将来 SSR 対応や loaders 追加が必要になった時点で改めて検討

---

## Risks & Mitigations

- `@types/react-router-dom@^5.3.3` 削除後に型エラーが露出する可能性 → `npm run build` で事前検証してから削除確定とする
- `v7_startTransition` が `React.lazy` と競合する可能性 → Mosaku では `React.lazy` 未使用のためリスクなし（確認済み）
- `react-router@7` と `react@19` の互換性 → v7 公式が React 18+ を要求、React 19 は対応範囲内

---

## References

- [React Router v6 → v7 公式 Upgrade Guide](https://raw.githubusercontent.com/remix-run/react-router/main/docs/upgrading/v6.md) — 段階移行手順・future flags 一覧
- [React Router CHANGELOG v7.0.0](https://raw.githubusercontent.com/remix-run/react-router/main/CHANGELOG.md) — 破壊的変更・削除 API 一覧
- [react-router-dom v7 npm](https://www.npmjs.com/package/react-router-dom) — パッケージ統合状況確認
