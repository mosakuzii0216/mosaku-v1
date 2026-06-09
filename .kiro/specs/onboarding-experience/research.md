# Research & Design Decisions

---

**Purpose**: Capture discovery findings, architectural investigations, and rationale for the onboarding-experience technical design.

---

## Summary

- **Feature**: `onboarding-experience`
- **Discovery Scope**: Extension（既存 notebook / memo / theme / auth 系への拡張）
- **Key Findings**:
  - `User` モデルに `onboardingCompleted` カラムを追加し、DB 永続化が最も信頼性が高い（LocalStorage は端末をまたいで失われる）
  - 既存の `apiClient` + `useNotebookQueries` / `useMemoQueries` パターンをそのまま再利用でき、`POST /onboarding/complete` と `POST /onboarding/skip` の 2 エンドポイントで冪等に完結する
  - フロントエンドの `UserProfile` 型に `onboardingCompleted: boolean` を追加し、`useAuth()` フックを通じてオンボーディングトリガーを判定する設計が既存の Auth コンテキストと最も整合性が高い

## Research Log

### 既存オンボーディング実装の有無

- **Context**: `onboarding` が既に存在する場合はそちらを拡張する必要がある
- **Sources Consulted**: `grep -rn "onboarding"` 全体サーチ、`schema.prisma` 確認
- **Findings**:
  - 既存実装ゼロ。`User` モデルに `onboardingCompleted` フィールドなし
  - フロントエンドにもオンボーディング関連コンポーネントなし
- **Implications**: 新規 NestJS モジュール + DB マイグレーション + フロントエンドコンポーネントすべて新設が必要

### User モデルの完了状態永続化方法

- **Context**: スキップ・完了後に再表示しない仕組みが必要（要件 1.3, 1.4）
- **Sources Consulted**: `schema.prisma`, `GET /auth/me` 実装, `UserProfile` 型定義
- **Findings**:
  - `/auth/me` は `User` レコードをそのまま返す設計
  - `UserProfile` 型（`frontend/src/utils/auth.ts`）に `onboardingCompleted` を追加するだけで、既存の `useAuth()` フックから参照できる
  - `AuthContext` の `refreshUser()` が `/auth/me` を再取得するため、完了後に `refreshUser()` を呼べば `user.onboardingCompleted` が即時反映される
- **Implications**:
  - Backend: `User` モデル + マイグレーション + `/auth/me` レスポンスへの自動反映（`findUserById` が User 全フィールドを返すため追加実装不要）
  - Frontend: `UserProfile` 型に追加 → 既存認証フローに影響なし

### 既存テーマ取得 API の動作確認

- **Context**: オンボーディングのテーマギャラリーで全テーマ一覧が必要
- **Sources Consulted**: `api.ts` の `getThemes()`, `GET /theme` コントローラ
- **Findings**:
  - `apiClient.getThemes()` が `GET /theme` を叩き、認証ユーザーのテーマ一覧を返す
  - `apiClient.getSystemThemes()` で `isSystem: true` のテーマのみ取得可能
  - `useThemes()` Hook がすでに `useThemeQueries.ts` に存在する可能性（要確認）
- **Implications**: テーマギャラリーは `apiClient.getSystemThemes()` または `getThemes()` を再利用すれば新規 API 不要

### ノートブック + メモ作成の既存 API 確認

- **Context**: Onboarding Service がバックエンドでノートブック・メモを作成するため既存 API を利用
- **Sources Consulted**: `NotebookService.create()`, `MemoService.create()`, `CreateNotebookDto`, `CreateMemoDto`
- **Findings**:
  - `NotebookService.create(dto, userId)` は `{ name, themeId, content }` を受け取り、テーマ付きノートブックを作成
  - `MemoService.create()` は通常のメモ作成と同一フローで `notebookId` を指定してノートブック内メモを作成できる
  - 所有権バリデーションは `BaseOwnableService.findOne()` で統一されている
- **Implications**: `OnboardingService` はサービス層で `NotebookService` + `MemoService` を直接 inject して利用し、HTTP 経由での二重 API コールを避ける

### 冪等性の保証方法

- **Context**: 要件 6.1, 6.2：重複作成の防止
- **Sources Consulted**: `User` モデル, `auth.controller.ts`
- **Findings**:
  - `User.onboardingCompleted` が `true` であれば早期リターンで完了応答を返すだけで冪等性が保証できる
  - データ作成中のクラッシュ再試行ケース（要件 6.2）は `onboardingCompleted` が `false` のまま残るため、再試行時にノートブックが二重作成される可能性がある
  - ただし Prisma Transaction で ノートブック作成 + メモ作成 + フラグ更新を単一トランザクションにすればアトミック
- **Implications**: `OnboardingService.complete()` は Prisma Transaction 内で実行し、フラグ更新を最後に行うことで「フラグが立っているなら絶対に作成済み」の不変式を維持

### フロントエンドのオンボーディングトリガー設計

- **Context**: 「メイン画面到達時にオンボーディング未完了ならフローを開始」（要件 1.1）
- **Sources Consulted**: `AuthContext.tsx`, `App.tsx`, `useAppReadyStore.ts`
- **Findings**:
  - `AuthContext` の `user: UserProfile | null` が認証完了後に設定される
  - `App.tsx` が `AuthProvider` を最上位でラップし、認証状態に応じてルーティングを制御している
  - 認証済みルートのルートコンポーネント内に `OnboardingGate` を差し込むことで、既存の認証フローを変更せずにオンボーディングチェックを追加できる
- **Implications**: `OnboardingGate` コンポーネントを認証済み画面のルートに配置し、`user.onboardingCompleted === false` のとき `useOnboardingStore` の `open()` を呼ぶ設計を採用

---

## Architecture Pattern Evaluation

| Option                          | Description                                | Strengths              | Risks / Limitations                                    | Notes                          |
| ------------------------------- | ------------------------------------------ | ---------------------- | ------------------------------------------------------ | ------------------------------ |
| **LocalStorage のみ**           | `onboardingCompleted` をブラウザに保存     | 実装簡単、API 不要     | 端末をまたいで失われる、プライベートブラウズで毎回表示 | 不採用                         |
| **DB 永続化 + /auth/me 反映**   | User モデルにフラグ追加、/auth/me に含める | 端末間共有、信頼性高い | マイグレーション必要                                   | **採用**                       |
| **専用 GET /onboarding/status** | 独立したステータスエンドポイント           | 関心分離が明確         | 余分な API コール、/auth/me と情報が分散               | 不採用（既存 /auth/me で十分） |

| Option                                    | Description                                           | Strengths                  | Risks / Limitations         | Notes    |
| ----------------------------------------- | ----------------------------------------------------- | -------------------------- | --------------------------- | -------- |
| **単一エンドポイント（skip フラグ付き）** | `POST /onboarding/complete { themeId?, skip }`        | エンドポイント 1 つで完結  | skip のセマンティクスが曖昧 | 不採用   |
| **2 エンドポイント分離**                  | `POST /onboarding/complete` + `POST /onboarding/skip` | 意図が明確、テストしやすい | エンドポイント数が増える    | **採用** |

---

## Design Decisions

### Decision: onboardingCompleted を User モデルで DB 永続化

- **Context**: スキップ・完了後に二度と表示しない（要件 1.3, 1.4）
- **Alternatives Considered**:
  1. LocalStorage のみ — 端末をまたいで失われる
  2. DB 永続化（User モデル拡張）— 信頼性高い
- **Selected Approach**: `User` モデルに `onboardingCompleted Boolean @default(false)` を追加し、`/auth/me` レスポンスに自動反映
- **Rationale**: 既存の `/auth/me` → `UserProfile` フロー（`AuthContext`）を再利用でき、追加 API コールゼロで実現できる
- **Trade-offs**: Prisma マイグレーションが必要。`@default(false)` で既存ユーザーへの影響なし
- **Follow-up**: 既存ユーザー（既に利用中のユーザー）はオンボーディング未完了扱いになるため、`onboardingCompleted` の初期値を `true` にするか、あるいはすでに notebook を持つユーザーにはスキップするロジックが必要。→ **既存ユーザーの扱い**: 招待制・限定公開フェーズのため対象ユーザーは開発者のみ。手動マイグレーションで既存ユーザーの `onboardingCompleted=true` を設定する運用で許容する

### Decision: OnboardingService が NotebookService / MemoService を直接 inject

- **Context**: ようこそノートブック + サンプルメモの作成（要件 4, 5）
- **Alternatives Considered**:
  1. OnboardingController が既存 notebook/memo HTTP エンドポイントを呼ぶ — 二重 HTTP コール
  2. OnboardingService が NotebookService / MemoService を直接 inject — モジュール内での直接連携
- **Selected Approach**: NestJS の DI を使い `NotebookService` と `MemoService` を `OnboardingService` に inject
- **Rationale**: HTTP 二重コールを避け、Prisma Transaction での一括実行を可能にする
- **Trade-offs**: モジュール間の依存が増えるが、NestJS の `imports: [NotebookModule, MemoModule]` で管理可能

### Decision: フロントエンドの UI 状態を useOnboardingStore（Zustand）で管理

- **Context**: 要件 8.2：オンボーディングの UI 状態を Zustand で管理
- **Alternatives Considered**:
  1. React の `useState` / Context — コンポーネントローカル状態
  2. Zustand store — 既存パターンに従った UI 状態管理
- **Selected Approach**: `useOnboardingStore` Zustand store でモーダル開閉 / 現在ステップ / 選択テーマID / ローディング状態を管理
- **Rationale**: 要件 8.2 の明示的な指定に従い、既存ストアパターン（`useViewStore`, `useMemoDataStore`）と統一

### Decision: OnboardingGate コンポーネントによるトリガー

- **Context**: 要件 1.1：メイン画面到達時にオンボーディング未完了なら自動起動
- **Selected Approach**: 認証済みルートのルートコンポーネント内に `OnboardingGate` を配置。`user.onboardingCompleted === false` を検出して `useOnboardingStore.open()` を呼ぶ
- **Rationale**: `AuthContext` と `App.tsx` のルーティングを最小限の変更で済む

---

## Risks & Mitigations

- **既存ユーザーへの影響**: `onboardingCompleted @default(false)` により既存ユーザーにもオンボーディングが表示される → マイグレーション時に `UPDATE users SET onboarding_completed = true WHERE created_at < [リリース日]` を実行して対処
- **Prisma Transaction の失敗**: ノートブック作成成功・フラグ更新失敗の場合 → Transaction ロールバックで一貫性維持。再試行時は冪等処理（フラグが false のため再作成）→ ノートブック名に unique 制約がないため重複しうる。許容範囲内（手動で削除可能）
- **テーマ CSS の読み込み遅延**: プレビューカードでテーマ CSS を動的 import した場合の遅延 → テーマのプライマリカラー（`styles.primaryColor`）を使ったカラーチップ表示で代替し、CSS 全読み込みは「確定選択後」のみに遅延
- **モバイル対応（要件 2.6）**: テーマギャラリーのグリッドがモバイル幅で崩れる → Tailwind の `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` パターンで対応

---

## References

- `backend/prisma/schema.prisma` — User / Notebook / Memo モデル定義
- `frontend/src/contexts/AuthContext.tsx` — UserProfile 型・認証フロー
- `frontend/src/utils/auth.ts` — UserProfile インターフェース
- `frontend/src/hooks/useNotebookQueries.ts` — React Query フックパターン
- `frontend/src/stores/useMemoDataStore.ts` — Zustand UI ストアパターン
- `frontend/src/hooks/useActiveTheme.ts` — テーマ解決フック
- `backend/src/notebook/notebook.service.ts` — NotebookService.create() インターフェース
