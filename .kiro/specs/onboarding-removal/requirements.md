# Requirements Document

## Project Description (Input)

オンボーディング機能を全削除する。ユーザー登録直後に表示されるオンボーディングモーダル（テーマ選択＋サンプルメモ生成）が「早すぎた」「毎回表示されて邪魔」という理由で不要になったため。削除範囲: バックエンドは backend/src/onboarding/ モジュール丸ごと（controller/service/dto/spec、エンドポイントは POST /onboarding/complete と /onboarding/skip）と app.module.ts の OnboardingModule 登録解除、Prisma schema の User.onboardingCompleted カラムを migration で drop。フロントエンドは components/onboarding/（OnboardingGate/OnboardingModal/ThemeGallery）、stores/useOnboardingStore.ts、hooks/useOnboardingQueries.ts を削除、App.tsx の import と JSX 参照除去、utils/api.ts の completeOnboarding/skipOnboarding 削除、utils/auth.ts の User 型 onboardingCompleted フィールド削除。注意: config/config.service.ts の onboarding@resend.dev はメール送信元デフォルトで無関係なので触らない。詳細は .kiro/steering/20260618-onboarding-removal/brainstorm.md を参照。なおギャップ分析（gap-analysis.md）により、brainstorm の影響範囲に未記載だった追加クリーンアップ対象が判明: `backend/src/auth/auth.controller.spec.ts` の getMe テストが `onboardingCompleted` に依存しているため除去が必要。また backend 側の `AuthenticatedUser` 型は `Omit<User, 'password'>` 由来でカラム drop + `prisma generate` により自動更新されるため手動編集は不要。

## Introduction

本仕様はオンボーディング機能（テーマ選択＋サンプルメモ生成を行う登録直後モーダル）をプロダクトから完全に除去することを目的とする。当該機能は「早すぎた」「毎回表示されて邪魔」という UX 上の問題があり、かつ他モジュールから参照されない独立した機能であるため、フロントエンド・バックエンド・データベースの三層から痕跡を残さず削除する。スコープは「削除」のみであり、新規機能追加や代替フローの提供は含まない。削除後もアプリケーションのビルド・型チェック・既存テストがグリーンであること、および認証直後のユーザー体験がモーダルなしで正常に成立することを成功条件とする。

## Requirements

### Requirement 1: フロントエンドのオンボーディング UI 除去

**Objective:** As a 既存ユーザー, I want ログイン・登録直後にオンボーディングモーダルが表示されないこと, so that 毎回の割り込みなくすぐにメイン画面を利用できる

#### Acceptance Criteria

1. When ユーザーが新規登録または初回ログインを完了したとき, the Mosaku Frontend shall オンボーディングモーダル（OnboardingModal）を表示しない
2. When アプリケーションがレンダリングされるとき, the Mosaku Frontend shall OnboardingGate によるモーダル起動判定を実行しない
3. The Mosaku Frontend shall `components/onboarding/`（OnboardingGate / OnboardingModal / ThemeGallery）を含まない
4. When `App.tsx` がマウントされるとき, the Mosaku Frontend shall オンボーディング関連コンポーネントの import および JSX 参照を一切含まない
5. The Mosaku Frontend shall オンボーディング機能の除去後もテーマ選択を既存のテーマ設定 UI 経由で引き続き提供する

### Requirement 2: フロントエンドのデータ層・型・API クライアントのクリーンアップ

**Objective:** As a 開発者, I want オンボーディングに関する状態管理・クエリ・型・API 呼び出しが残存しないこと, so that デッドコードや未使用参照による混乱とビルドエラーを防げる

#### Acceptance Criteria

1. The Mosaku Frontend shall `stores/useOnboardingStore.ts` を含まない
2. The Mosaku Frontend shall `hooks/useOnboardingQueries.ts` を含まない
3. The Mosaku Frontend shall `utils/api.ts` から `completeOnboarding` および `skipOnboarding` 関数を含まない
4. The Mosaku Frontend shall `utils/auth.ts` の `UserProfile` インターフェースから `onboardingCompleted` フィールドを含まない
5. If オンボーディング関連のモジュール・関数・型への参照が他ファイルに残存している場合, then the Mosaku Frontend shall TypeScript 型チェックでエラーを報告する（=残存参照ゼロを保証する）

### Requirement 3: バックエンドのオンボーディングモジュール・エンドポイント除去

**Objective:** As a 開発者, I want オンボーディング用の NestJS モジュールと API エンドポイントが存在しないこと, so that 不要なエンドポイントの保守コストと攻撃面を削減できる

#### Acceptance Criteria

1. The Mosaku Backend shall `backend/src/onboarding/`（controller / service / dto / spec）を含まない
2. When NestJS アプリケーションが起動するとき, the Mosaku Backend shall `OnboardingModule` を読み込まない
3. The Mosaku Backend shall `app.module.ts` から `OnboardingModule` の import および imports 配列への登録を含まない
4. When クライアントが `POST /onboarding/complete` または `POST /onboarding/skip` を呼び出したとき, the Mosaku Backend shall 404 Not Found を返す
5. The Mosaku Backend shall オンボーディング機能の除去後も他モジュール（auth / memo / theme 等）の既存エンドポイントを変更なく提供する

### Requirement 4: データベーススキーマからの onboardingCompleted カラム削除

**Objective:** As a 開発者, I want User テーブルから onboardingCompleted カラムを削除すること, so that 使われないカラムを残さずスキーマを正規化できる

#### Acceptance Criteria

1. The Prisma Schema shall `User` モデルに `onboardingCompleted` フィールドを含まない
2. When マイグレーションが適用されるとき, the Database shall `User` テーブルから `onboardingCompleted` カラムを削除する
3. The Mosaku Backend shall マイグレーションファイルを `prisma/migrations/` 配下に新規作成して当該カラム削除を記録する
4. When 本番環境へデプロイするとき, the Deployment Process shall `prisma migrate deploy` により当該マイグレーションを適用する
5. While マイグレーション適用後, the Mosaku Backend shall `onboardingCompleted` を参照するコードを一切含まないことで Prisma クライアントの整合性を保つ

### Requirement 5: 無関係箇所の保護とビルド健全性

**Objective:** As a 開発者, I want 削除作業が無関係なコードに波及せず、削除後もプロジェクト全体が健全であること, so that リグレッションなく安全に機能を撤去できる

#### Acceptance Criteria

1. The Mosaku Backend shall `config/config.service.ts` の `onboarding@resend.dev`（メール送信元デフォルト値）を変更しない
2. When フロントエンドとバックエンドのビルドを実行したとき, the Build Process shall エラーなく完了する
3. When 既存のユニットテスト・E2E テストを実行したとき, the Test Suite shall オンボーディング削除に起因する失敗を発生させない
4. The Mosaku Backend and Frontend shall オンボーディング機能に紐づくテストを削除する。対象は以下を含む:
   - `backend/src/onboarding/*.spec.ts`（モジュールごと削除）
   - `backend/src/auth/auth.controller.spec.ts` の `getMe` テスト群から `onboardingCompleted` のモック値とアサーション（`onboardingCompleted: true/false` を返す前提・`toMatchObject({ onboardingCompleted })`）を除去する
   - `frontend/src/utils/api.test.ts` の `completeOnboarding` / `skipOnboarding` に関するテスト
   - `frontend/src/components/onboarding/*.test.tsx`、`frontend/src/hooks/useOnboardingQueries.test.ts`、`frontend/src/stores/useOnboardingStore.test.ts`（対象ファイルごと削除）
5. While `onboardingCompleted` カラム削除後, the Mosaku Backend shall `AuthenticatedUser`（= `Omit<User, 'password'>`）型および `GET /auth/me` レスポンスから当該フィールドが自動的に除外されることを `npx prisma generate` 実行で保証する（明示的な型編集は不要）
6. When `npm run lint` を実行したとき, the Lint Process shall 未使用 import・未参照シンボルに関する新規エラーを報告しない
