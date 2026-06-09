# Implementation Plan

- [x] 1. User.onboardingCompleted フィールドの DB マイグレーション
  - `onboarding_completed` カラム（BOOLEAN, NOT NULL, DEFAULT FALSE）を users テーブルに追加する Prisma マイグレーションを作成・適用する
  - Prisma スキーマの `User` モデルに `onboardingCompleted Boolean @default(false) @map("onboarding_completed")` を追加し `npx prisma generate` でクライアントを再生成する
  - マイグレーションファイルのコメントに、リリース後の既存ユーザー向け手動 SQL（`UPDATE users SET onboarding_completed = true WHERE created_at < '<リリース日>'`）を記載する
  - _Requirements: 1.3, 1.4_

- [x] 2. バックエンド: Onboarding ドメインモジュールの実装
- [x] 2.1 OnboardingService の実装（complete / skip メソッドとサンプルコンテンツ定義）
  - `complete(userId, themeId)`: 冒頭で `onboardingCompleted` を確認し `true` の場合は早期リターンして重複作成を防ぐ（べき等）
  - Prisma Transaction 内でようこそノートブック作成 → サンプルメモ 2 枚作成 → `onboardingCompleted = true` 更新を一括実行する
  - サンプルメモには見出し・チェックリスト・コードブロック・スラッシュコマンド使用例と日常利用を想起させる実例コンテンツを `SAMPLE_MEMO_CONTENT` 定数として定義する（テーマはノートブック ID 経由で自動適用される）
  - テーマ適用失敗（Prisma FK 違反等）はトランザクション全体をロールバックし、フロントエンドに 400 エラーで通知する
  - `skip(userId)`: ノートブック・メモを作成せず `onboardingCompleted = true` のみ更新する
  - 作成したノートブック・メモは通常モデルと同一であり、ユーザーが通常通り編集・削除できる状態にする
  - `NotebookService` / `MemoService` を DI で注入し、HTTP を介さず直接操作する
  - _Requirements: 1.3, 3.2, 3.3, 4.1, 4.2, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 7.2_

- [x] 2.2 OnboardingController の実装（complete / skip エンドポイント公開）
  - `POST /onboarding/complete`（`{ themeId: string }` を受け取り `{ notebookId, memoIds }` を返す）を実装する
  - `POST /onboarding/skip`（`{ message: string }` を返す）を実装する
  - クラスに `@UseGuards(JwtAuthGuard)` を付与し全エンドポイントを JWT で保護する
  - `CompleteOnboardingDto` に `class-validator` デコレータを使用し `any` 禁止とする
  - `OnboardingModule.imports` に `NotebookModule` / `MemoModule` を追加して DI を有効化する
  - タスク 2.1 の完了後に実装する
  - _Requirements: 1.3, 3.1, 6.1_

- [x] 2.3 (P) GET /auth/me レスポンスへの onboardingCompleted フィールド追加
  - auth モジュールの `UserProfile` 型（バックエンド DTO・フロントエンド型定義の両方）に `onboardingCompleted: boolean` を追加する
  - `GET /auth/me` エンドポイントが `onboardingCompleted` フィールドを返すよう既存レスポンス DTO を更新する
  - タスク 2.1 / 2.2 と独立して実装可能（auth モジュールへの変更のみ）
  - _Requirements: 1.2, 1.4_

- [x] 3. (P) フロントエンド: useOnboardingStore の実装
  - `isOpen: boolean`, `selectedThemeId: string | null`, `open()`, `close()`, `setSelectedThemeId()` を持つ Zustand ストアを `stores/useOnboardingStore.ts` として既存ストアパターンに沿って作成する
  - 初期状態は `isOpen: false`, `selectedThemeId: null`（テーマ未選択状態でオンボーディング開始）
  - ローディング状態は React Query の `isPending` で代替するためストアには持たない
  - セッション内メモリのみ（永続化なし。永続化は DB の `onboardingCompleted` フラグが担う）
  - タスク 2 と独立して実装可能
  - _Requirements: 2.3, 6.3, 8.2_

- [x] 4. フロントエンド: apiClient 拡張と useOnboardingQueries の実装
- [x] 4.1 (P) apiClient への completeOnboarding / skipOnboarding メソッド追加
  - `apiClient.completeOnboarding(themeId)` → `POST /onboarding/complete` を呼ぶメソッドを `utils/api.ts` に追加する
  - `apiClient.skipOnboarding()` → `POST /onboarding/skip` を呼ぶメソッドを追加する
  - API 契約は design.md で確定済みのため、タスク 2 / 3 と独立して実装可能
  - _Requirements: 4.5, 8.3_

- [x] 4.2 useOnboardingQueries の complete / skip ミューテーション実装
  - `useCompleteOnboarding`: mutate 成功時に `refreshUser()` → `invalidateQueries(notebooks.all)` → `goToMemosForNotebook(notebookId)` の順で実行する
  - `useSkipOnboarding`: 成功時に `refreshUser()` → `close()` を実行する
  - エラー時は Sentry に `feature_area: 'onboarding'`, `step: 'complete'|'skip'`, `userId` タグを付与してキャプチャし、toast でユーザーに通知しつつ `close()` でメイン画面へ遷移するグレースフルデグレードを実装する（`feature_area` enum への `'onboarding'` 追加も行う）
  - `isPending` を `OnboardingModal` に公開してローディング中の重複実行を防ぐ
  - タスク 3 と 4.1 の完了後に実装する
  - _Requirements: 4.3, 6.3, 7.1, 7.3, 8.1, 8.3_

- [ ] 5. フロントエンド: テーマ選択 UI コンポーネント
- [ ] 5.1 (P) ThemePreviewCard の実装
  - `theme.styles.primaryColor` を色チップとして表示し、テーマ名を下部に表示する単一テーマカードを実装する
  - 選択状態（`isSelected` prop）を枠線・チェックマーク等のビジュアルフィードバックで示す
  - ホバーアニメーションを CSS で実装し、`@media (prefers-reduced-motion: reduce)` で抑制する（CSS レベルで対応）
  - タスク 2 / 3 と独立して実装可能
  - _Requirements: 2.2, 2.7_

- [ ] 5.2 ThemeGallery の実装
  - `useSystemThemes()` でテーマ一覧を取得し `ThemePreviewCard` をグリッド表示する
  - レイアウトは `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3` のレスポンシブグリッド（モバイル 2 列・タブレット 3 列・デスクトップ 5 列）
  - データ取得中はスケルトン UI を表示する
  - タスク 5.1 の完了後に実装する
  - _Requirements: 2.1, 2.6_

- [ ] 6. フロントエンド: OnboardingModal の実装
  - `fixed inset-0 z-50` の全画面オーバーレイとして実装する（既存 `FeedbackModal` パターン参照）
  - `ThemeGallery` を内包し、`useOnboardingStore` から `isOpen` / `selectedThemeId` を、`useOnboardingQueries` から `isPending` を受け取る
  - "始める" ボタンは `selectedThemeId === null || isPending` のとき `disabled` にしてテーマ未選択での進行を防ぐ
  - "あとで" スキップリンクは `isPending` のとき非表示にしてローディング中の操作を防ぐ（主要導線より目立たない控えめなスタイルで表示）
  - モーダルの z-index が既存の認証状態やログアウト操作を妨げない実装にする
  - タスク 3 / 4.2 / 5.2 の完了後に実装する
  - _Requirements: 1.5, 2.4, 2.5, 6.3_

- [ ] 7. フロントエンド: OnboardingGate の実装とアプリへの統合
  - `user.onboardingCompleted === false` のときに `useOnboardingStore.open()` を呼ぶ副作用コンポーネントを `components/onboarding/OnboardingGate.tsx` として実装する（レンダリング出力はゼロ、`return null`）
  - `useEffect(() => { if (user && !user.onboardingCompleted) open(); }, [user])` パターンで実装する
  - `AuthGuard` 内（`AppContent` の直前）に `<OnboardingGate />` と `<OnboardingModal />` を配置してアプリに統合する
  - タスク 6 の完了後に実装する
  - _Requirements: 1.1, 1.2, 1.4_

- [ ] 8. バックエンドテスト
- [ ] 8.1 (P) OnboardingService ユニットテスト
  - `complete()` 正常系: ようこそノートブック + サンプルメモ 2 枚 + `onboardingCompleted=true` が作成されることを確認する
  - `complete()` べき等: 2 回目の呼び出しで早期リターンし重複作成しないことを確認する
  - `skip()`: `onboardingCompleted=true` のみ更新され、ノートブック・メモが作成されないことを確認する
  - _Requirements: 6.1, 6.2_

- [ ] 8.2 (P) OnboardingController インテグレーションテスト
  - `POST /onboarding/complete`: 認証済みユーザーでノートブック + メモが作成され `onboardingCompleted=true` になることを確認する
  - `POST /onboarding/skip`: ノートブック・メモが作成されず `onboardingCompleted=true` になることを確認する
  - `GET /auth/me`: `onboardingCompleted` フィールドが `UserProfile` レスポンスに含まれることを確認する
  - べき等テスト: `complete` を 2 回呼んだとき 2 回目は重複作成しないことを確認する
  - _Requirements: 6.1, 6.2_

- [ ]\* 9. フロントエンドユニットテスト（オプション・MVP 後対応可）
  - `useOnboardingStore` の初期状態（`isOpen: false`, `selectedThemeId: null`）と各アクションの動作を確認する
  - `useCompleteOnboarding` の mutate 成功時に `refreshUser` + `invalidateQueries` + navigate が呼ばれることを確認する
  - _Requirements: 2.3, 8.1, 8.2_
