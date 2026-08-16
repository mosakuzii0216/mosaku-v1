# Research & Design Decisions

---

**Feature**: `oauth-providers-expansion`
**Discovery Scope**: Extension（既存 Passport.js アーキテクチャへの追加）

**Key Findings**:

- 既存の `OAuthService.handleOAuthLogin` / `handleOAuthRegistrationWithInvitation` は `BaseOAuthUser` + `providerId` を引数とする共通処理として設計済み。新プロバイダーの追加コストは低い
- Prisma `User` モデルは現在 `oauthId` という単一フィールドでGoogle/GitHub両方を管理。新3プロバイダーは専用フィールド（`lineId`, `appleId`, `xId`）を追加し、`handleOAuthLogin` をプロバイダーフィールド対応に拡張する
- Apple は OAuth コールバックが POST であり（業界標準の GET と異なる）、初回ログイン時のみメールを返す仕様。`@Public()` デコレータと POST ルートの特別対応が必要

---

## Research Log

### Passport.js ライブラリ調査

- **Context**: LINE/Apple/X 各プロバイダー向けの Passport Strategy ライブラリの選定
- **Findings**:
  - LINE: `passport-line-auth`（`passport-line` は非推奨）。LINE Login v2.1 API 対応
  - Apple: `passport-apple`。Apple の JWT（`id_token`）を検証しユーザー情報を取得
  - X: `passport-twitter-oauth2`（OAuth 2.0）。既存 `env.ts` の `xConsumerKey` は OAuth 1.0a 向けだが要件は OAuth 2.0 を指定
- **Implications**: 3ライブラリをバックエンド依存に追加。Apple は秘密鍵ファイル（.p8）の扱いが必要

### 既存 Prisma スキーマの制約

- **Context**: `User` モデルに `lineId`, `appleId`, `xId` を追加する際の設計確認
- **Findings**:
  - 現在 `oauthId String? @unique` の1フィールドで全プロバイダーを管理
  - Google/GitHub は `oauthId` を引き続き使用（マイグレーションコストを避ける）
  - 新3フィールドはそれぞれ nullable + unique 制約
- **Implications**: `handleOAuthLogin` がどのフィールドを検索・更新するかをプロバイダーごとに分岐する必要がある

### Apple OAuth の特殊仕様

- **Context**: Sign in with Apple の実装要件確認
- **Findings**:
  - コールバックは `POST /auth/apple/callback`（Apple の仕様）
  - 初回認証時のみ `email` を返す。2回目以降は `sub`（appleId）のみ
  - `register-with-invitation` でメールアドレスが取得できない場合、フロントエンドでユーザーに入力させる必要がある
  - Apple の秘密鍵（.p8）を環境変数にインライン展開する必要がある（ファイルパスではなく文字列）
- **Implications**: Apple の `register-with-invitation` DTO はメールアドレスをオプショナルフィールドとして受け取る設計にする

### フロントエンド既存コードの対応状況

- **Context**: `AuthForm.tsx` と `OAuthInviteForm.tsx` の拡張ポイント確認
- **Findings**:
  - `OAuthInviteForm.tsx` は既に `providerName: 'Google' | 'GitHub' | 'X'` 型と X のスタイルを定義済み
  - `AuthForm.tsx` の `AuthMode` 型と providers 配列がハードコードされており、新プロバイダー追加で拡張が必要
  - `AuthContext` の `googleRegisterWithInvitation` / `githubRegisterWithInvitation` パターンに倣い3関数を追加

---

## Architecture Pattern Evaluation

| オプション                      | 説明                                                   | メリット                                 | リスク                                                 |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------ |
| **A: 既存パターン踏襲（採用）** | 各プロバイダーに Strategy/Guard/Service メソッドを追加 | 既存コードと一貫性が高い、テストしやすい | ファイル数が増える                                     |
| B: Generic Strategy Factory     | プロバイダー設定オブジェクトから動的に Strategy を生成 | ファイル数削減                           | Passport.js との互換性が不明確、デバッグが難しい       |
| C: OAuthAccount テーブル追加    | ユーザーと OAuth ID を別テーブルで管理                 | 将来的な拡張性が高い                     | マイグレーションコスト大、既存コードの大規模変更が必要 |

→ **Option A** を採用。既存の Google/GitHub と完全に同じ構造で3プロバイダーを追加する。

---

## Design Decisions

### Decision: `User` モデルのフィールド設計

- **Context**: 複数 OAuth ID をどう格納するか
- **Alternatives**:
  1. 単一 `oauthId` に `line:xxx` のようなプレフィックスを付けて格納
  2. 新プロバイダー専用フィールドを追加（`lineId`, `appleId`, `xId`）
- **Selected**: Option 2（専用フィールド）
- **Rationale**: Requirement 4 で明示的に専用フィールドが指定。型安全な検索・更新が可能
- **Trade-offs**: 既存 `oauthId` との不統一が残るが、Google/GitHub の再マイグレーションを避けられる

### Decision: Apple コールバックの POST ルート処理

- **Context**: Apple は `POST /auth/apple/callback` を要求するが、NestJS の `@UseGuards(AppleAuthGuard)` は通常 GET フローを想定
- **Selected**: `@Post('apple/callback')` + `@UseGuards(AppleAuthGuard)` + `@Public()` の組み合わせ。既存の `handleOAuthCallback` 共通メソッドを再利用
- **Trade-offs**: GET ルートなしに POST のみなので、ブラウザの直接アクセスには対応しない（Apple の仕様上問題なし）

---

## Risks & Mitigations

- Apple の秘密鍵（.p8）を環境変数に展開する際の改行コード問題 → `\n` を実際の改行に変換する処理を ConfigService に追加
- LINE のメールアドレス未取得時（ユーザーが許可しない場合）→ `oauthId` 相当の `lineId` で一意識別し、メールなしで登録できる設計
- X OAuth 2.0 の PKCE 要件 → `passport-twitter-oauth2` が PKCE に対応していることを実装時に確認
- ステージング環境でのコールバックURL不一致 → 環境変数 `LINE_REDIRECT_URI` / `APPLE_REDIRECT_URI` / `X_REDIRECT_URI` を明示的に設定
