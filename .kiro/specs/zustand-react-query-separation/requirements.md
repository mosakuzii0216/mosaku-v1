# Requirements Document

## Project Description (Input)

Zustand/React Query 責務分離（useMemoStore 後方互換ラッパーの廃止）

## Introduction

`useMemoStore` は、Zustand ストアを3つに分割した際に後方互換性を維持するために作られた統合ラッパーである。
現在、`useViewStore`・`useMemoDataStore`・`usePaletteStore` の3ストアへの分割は完了しているが、
9つのコンポーネント（`App.tsx`、各レイアウト・UI・メモ系コンポーネント）が依然として `useMemoStore` 経由でアクセスしている。
本機能は、この後方互換ラッパーを廃止し、各コンポーネントが個別ストアを直接使用する形への移行を完結させる。

技術方針として、**React Query をサーバー状態の唯一の真実の源泉**とし、**Zustand はUIの状態（表示モード・選択状態・パレット状態）のみ**を管理するという責務の境界を厳格に維持する。

## Requirements

### Requirement 1: useMemoStore 使用箇所の個別ストアへの移行

**Objective:** As a フロントエンド開発者, I want 各コンポーネントが `useMemoStore` ではなく必要なストアを直接 import して使用できる, so that 不要な間接層がなくなり依存関係が明確になる

#### Acceptance Criteria

1. When フロントエンドのビルドが実行される, the フロントエンド shall `useMemoStore` への import が存在しない状態でビルドが正常に完了する
2. The フロントエンド shall 以下の9ファイルにおいて `useMemoStore` の import を除去し、それぞれ必要な個別ストア（`useViewStore` / `useMemoDataStore` / `usePaletteStore`）を直接 import する：`App.tsx`、`MobileLayout.tsx`、`DesktopLayout.tsx`、`Header.tsx`、`MemoPalette.tsx`、`NotebookList.tsx`、`MemoList.tsx`、`MemoSearch.tsx`
3. When コンポーネントが必要な状態・アクションのサブセットのみを使用している場合, the コンポーネント shall 不要なストアを import しない（最小依存の原則）
4. The フロントエンド shall 移行後も既存の画面表示・操作（ナビゲーション・選択・パレット操作）が移行前と同一の挙動を維持する

---

### Requirement 2: useMemoStore ファイルの削除

**Objective:** As a フロントエンド開発者, I want `useMemoStore.ts` ファイルが削除された状態のコードベースで開発できる, so that 廃止済みの間接層を誤って参照するリスクがなくなる

#### Acceptance Criteria

1. When 全使用箇所の移行が完了した後, the フロントエンド shall `frontend/src/stores/useMemoStore.ts` ファイルが存在しない
2. If `useMemoStore` を参照するコードが残っている場合, the フロントエンド shall TypeScript コンパイルエラーとして検出される（= 削除によってコンパイルが通ることが移行完了の証明）
3. The フロントエンド shall `useMemoStore` に関する再エクスポート（`export { useViewStore } from './useViewStore'` 等）に依存するコードが存在しない

---

### Requirement 3: Zustand/React Query 責務境界の維持

**Objective:** As a フロントエンド開発者, I want Zustand ストアがサーバーデータを保持しないことが保証される, so that React Query を唯一の真実の源泉とする設計方針が明確に守られる

#### Acceptance Criteria

1. The フロントエンド shall `useViewStore`・`useMemoDataStore`・`usePaletteStore` のいずれも、メモ・ノートブック・タグ等のサーバーデータ（APIレスポンス）を state として保持しない
2. The フロントエンド shall Zustand ストアにサーバーデータをコピー・同期する処理が存在しない
3. When コンポーネントがメモ一覧・詳細・検索結果等のサーバーデータを必要とする場合, the コンポーネント shall `useMemoQueries.ts` 内の React Query フックのみを使用する
4. The フロントエンド shall 選択中のメモ ID（`selectedMemoId`）はUIの状態として Zustand で管理し、そのIDを元にしたメモデータの取得は React Query（`useMemo(id)`）が担当するという分離を維持する

---

### Requirement 4: 型安全性の維持

**Objective:** As a フロントエンド開発者, I want 移行後も TypeScript strict mode での型エラーが発生しない, so that リファクタリングによる型の後退が生じない

#### Acceptance Criteria

1. The フロントエンド shall TypeScript strict mode（`noImplicitAny`・`strictNullChecks`）のもとで型エラーなくコンパイルが通る
2. When 個別ストアのアクション・状態の型が `useMemoStore` の統合インターフェースと異なる場合, the コンポーネント shall 個別ストアの型をそのまま使用し、統合インターフェースへの型キャストを行わない
3. The フロントエンド shall `any` 型の使用が移行によって新たに導入されない
