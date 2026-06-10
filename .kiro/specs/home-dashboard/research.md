# Research & Design Decisions — home-dashboard

---

**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.

---

## Summary

- **Feature**: `home-dashboard`
- **Discovery Scope**: Extension（既存ビューシステムへの新ビュー追加 + 新 API ドメイン）
- **Key Findings**:
  - `useViewStore` の `ObjectType` / `ViewType` を拡張して `'home'` を追加する最小差分が最適
  - ダッシュボード集計（直近メモ・週件数・活動日付・ノートブック件数）は既存エンドポイントでは賄えず、新規 `DashboardModule` が必要
  - Requirement 1.5（セクション独立エラー）は React Query の並列クエリ分割で実現でき、単一サマリーエンドポイントとは相性が悪いため、エンドポイント分割を選択

## Research Log

### 既存ビューシステムの拡張ポイント分析

- **Context**: ホーム画面を既存レイアウトにどう組み込むかの検討
- **Sources Consulted**: `frontend/src/stores/useViewStore.ts`, `frontend/src/App.tsx`, `frontend/src/components/layouts/DesktopLayout.tsx`, `frontend/src/components/layouts/MobileLayout.tsx`
- **Findings**:
  - `useViewStore` が `currentObject: ObjectType` + `currentView: ViewType` の組み合わせでビューを制御
  - `ObjectType = 'memo' | 'notebook' | 'tag' | 'theme'`、`ViewType = 'list' | 'detail' | 'edit' | 'create' | 'tags' | 'trash'`
  - `DesktopLayout` / `MobileLayout` は `renderMainContent()` / `renderContent()` の switch で分岐
  - 初期状態は `currentView: 'create'`（新規メモ作成画面からスタート）
  - `goToMemoCreate()` は `useNavigation` / `useViewStore` に存在
- **Implications**:
  - `ObjectType` に `'home'` を追加し、`goToHome()` アクションを定義するだけで統合できる
  - 初期状態を `currentObject: 'home'` に変更してホーム画面をデフォルト表示にする
  - Layout 側の switch に `case 'home':` を追加するだけで既存コードへの影響が最小

### 既存 API エンドポイントの調査

- **Context**: 直近メモ・週件数・活動日付・ノートブック件数を既存 API で取得できるか
- **Sources Consulted**: `backend/src/memo/memo.controller.ts`, `backend/src/notebook/notebook.controller.ts`, `frontend/src/hooks/useMemoQueries.ts`, `frontend/src/hooks/useNotebookQueries.ts`
- **Findings**:
  - `GET /memos` は全件返却。`limit` パラメータ未対応（ページネーション版は `/memos/paginated`）
  - `/memos/paginated` には `sort` パラメータなし（updatedAt 降順固定かどうか未確認だが、専用エンドポイントが望ましい）
  - 週件数・活動日付の集計エンドポイントは存在しない
  - `/notebooks` は `memoCount` を含まない
  - `useNotebooks()` は既存で利用可能だが件数フィールドが欠けている
- **Implications**:
  - 新規 `DashboardModule` を backend に追加し、集計ロジックを集約する
  - 既存エンドポイントを変更しないことで後方互換性を保つ
  - 新エンドポイント: `GET /dashboard/recent-memos`, `GET /dashboard/weekly-count`, `GET /dashboard/activity-dates`, `GET /dashboard/notebooks`

### React Query 並列クエリと独立エラー設計

- **Context**: Requirement 1.5「他の独立したセクションの表示には影響を与えない」の実現方法
- **Sources Consulted**: `frontend/src/hooks/useMemoQueries.ts`, `frontend/src/hooks/useInvitationsQueries.ts`
- **Findings**:
  - React Query の各 `useQuery` 呼び出しは独立してローディング・エラー状態を持つ
  - コンポーネントが個別フックを呼ぶだけで自動的に並列実行・独立エラーが実現される
  - 単一サマリーエンドポイントでは一部失敗で全セクションが影響を受ける
- **Implications**:
  - `useHomeDashboardQueries.ts` に 4 つの独立フックを定義する
  - 各セクションコンポーネントが対応するフックを呼び出し、エラー/ローディングを自前でハンドリング

### 今日のお題の実装方式

- **Context**: Requirement 7.2「静的なテキストリストからランダムに1件選択」
- **Findings**:
  - API 呼び出し不要。`constants/dailyPrompts.ts` に静的配列を定義し、`useMemo` + 日付シード or マウント時ランダムで選択
  - 日付シード方式（YYYY-MM-DD を seed に）: 同日中は同じお題が表示される（安定性が高い）
  - マウント時ランダム: セッション中に複数回表示した際にお題が変わらない（再マウントで変わる）
  - 要件は「失敗しても非表示」だが静的リストなので失敗しない。エラーケースは配列空時の null チェックで対応
- **Implications**:
  - `DailyPrompt` コンポーネントは API 不使用。`constants/dailyPrompts.ts` から `useHomeDashboardQueries` への依存なし
  - 日付シード方式を採用し、同日は同じお題を表示する（UX 一貫性）

### ActivityCalendar の表示範囲設計

- **Context**: Requirement 5.1「直近の期間（当月または直近4週間）を週単位のグリッドで表示」
- **Findings**:
  - 「当月」vs「直近4週間」どちらか: 月をまたぐと行数が変わり UI が不安定になるため、直近5週間（35日）を固定表示する方針が安定
  - `Memo.createdAt` / `Memo.updatedAt` のどちらを使うか: 要件 5.4 は「createdAt または updatedAt」。実際には「その日にメモを書いた or 触った」日を記録したいため updatedAt を優先、作成のみの場合は createdAt も対象とする（いずれかの日付が対象日に含まれる）
  - バックエンドで日付集計を行い、`YYYY-MM-DD` 文字列の配列を返すのが最もシンプル
- **Implications**:
  - `GET /dashboard/activity-dates?from=...&to=...` で直近35日分のアクティブ日付を返す
  - フロントエンドは日付配列を受け取り、週グリッドを描画するだけ

## Architecture Pattern Evaluation

| Option                                              | Description                                       | Strengths                                        | Risks / Limitations                               | Notes      |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- | ---------- |
| A: 単一サマリーエンドポイント `GET /dashboard`      | 全集計データを1リクエストで返す                   | ネットワーク往復が1回                            | 1セクション失敗で全体が影響を受ける。Req 1.5 違反 | 採用しない |
| B: セクション別エンドポイント（新 DashboardModule） | 4つの独立エンドポイント、React Query で並列クエリ | セクション独立ロード・エラー。既存パターンに沿う | 4往復（ただし並列なので体感差少）                 | **採用**   |
| C: 既存エンドポイント拡張                           | `/memos?limit=5` 等を拡張                         | 新ファイル最小                                   | 既存 API の破壊的変更リスク。集計ロジックの混入   | 採用しない |

## Design Decisions

### Decision: `ObjectType` に `'home'` を追加

- **Context**: ホーム画面を `useViewStore` の状態機械にどう組み込むか
- **Alternatives Considered**:
  1. `currentView: 'home'` を追加（ObjectType は変更しない）
  2. `ObjectType: 'home'` を追加（ViewType は任意）
  3. 独立した `useHomeStore` を作成
- **Selected Approach**: `ObjectType` に `'home'` を追加し、`currentView` はホーム表示中は任意（switch で `case 'home':` に入る）
- **Rationale**: 既存の switch 分岐パターンを維持しつつ最小差分。`ObjectType` が画面の「主コンテキスト」を表すという既存設計に合致
- **Trade-offs**: `ViewType` に `'home'` が現れない点で若干非対称だが、ホームは単一ビューなので問題なし
- **Follow-up**: `useNavigation` に `goToHome()` を追加し、レイアウトの初期状態を `currentObject: 'home'` に変更

### Decision: 新規 `DashboardModule` を backend に追加

- **Context**: 集計データを既存モジュールに追加するか新規モジュールにするか
- **Alternatives Considered**:
  1. `MemoModule` に集計エンドポイントを追加
  2. 独立した `DashboardModule` を作成
- **Selected Approach**: 独立 `DashboardModule` を作成（`backend/src/dashboard/`）
- **Rationale**: 集計ロジックはメモ・ノートブック両ドメインにまたがる横断的関心事。単一モジュールに閉じることでドメイン境界を汚さない
- **Trade-offs**: 新ファイル追加が増えるが、将来の集計クエリ追加が容易になる

### Decision: ノートブック件数は専用エンドポイントで返す

- **Context**: 既存 `/notebooks` に `memoCount` を追加するか、新エンドポイントを作るか
- **Selected Approach**: `GET /dashboard/notebooks` で `{ id, name, memoCount }[]` を返す（既存 `/notebooks` は変更しない）
- **Rationale**: 既存エンドポイントへの変更は利用箇所全体への影響調査が必要。新エンドポイントなら影響範囲ゼロ

## Risks & Mitigations

- 週の境界計算（月曜始まり・タイムゾーン）— バックエンドで JST（UTC+9）に固定して計算。`from`/`to` はクエリパラメータで ISO 日付文字列を受け取り、バックエンドが JST で週境界を算出
- `ActivityCalendar` の描画コスト — 35日分の日付文字列配列（最大35要素）は軽微。CSS Grid で実装し canvas 不使用
- ホーム画面への初回ナビゲーション変更（既存: `create` → 新: `home`）— ユーザー体験の変化。要件 1.1 で明示的に求められているため許容

## References

- [TanStack Query Parallel Queries](https://tanstack.com/query/latest/docs/react/guides/parallel-queries) — 並列クエリによる独立ローディング
- [Prisma count](https://www.prisma.io/docs/orm/prisma-client/queries/aggregation-grouping-summarizing) — `_count` でリレーション件数集計
