# Research & Design Decisions

---

**Purpose**: `auth-register-invitation-refactor` のディスカバリー結果・アーキテクチャ調査・設計判断の根拠を記録する。

---

## Summary

- **Feature**: `auth-register-invitation-refactor`
- **Discovery Scope**: Extension（既存システムの責務移動）
- **Key Findings**:
  - `InvitationModule` がすでに `AuthModule` をインポートしているため、`AuthModule` が `InvitationModule` をインポートすると循環依存が発生する
  - `AuthModule` はすでに `InvitationService` を `providers` 配列に直接登録しており、循環依存を回避した実装になっている
  - `OAuthService` が `InvitationService` を DI で受け取ってサービス層内で検証する実装パターンが既存のベストプラクティスとして存在する

## Research Log

### 循環依存リスクの調査

- **Context**: Requirement 2.1 は「`AuthModule` に `InvitationModule` を `imports` 配列に追加する」と記述しているが、実際のコードを確認したところ循環依存の可能性があった
- **Sources Consulted**: `backend/src/invitation/invitation.module.ts`、`backend/src/auth/auth.module.ts`
- **Findings**:
  - `InvitationModule` は `imports: [PrismaModule, AuthModule, CommonModule]` として `AuthModule` に依存している
  - `AuthModule` に `InvitationModule` を追加すると `AuthModule ↔ InvitationModule` の循環依存が発生する
  - 現状の `AuthModule` はすでに `InvitationService` を `providers` 配列に直接登録して循環依存を回避している
- **Implications**: Requirement 2.1 の「`InvitationModule` を `imports` に追加」は実現不可。現在の直接プロバイダ登録パターンを維持する。`AuthService` のコンストラクタに `InvitationService` を追加するだけでよい

### OAuthService の招待コード処理パターン調査

- **Context**: `OAuthService` が `InvitationService` をどのように利用しているか確認して、同じパターンを `AuthService` に適用する
- **Sources Consulted**: `backend/src/auth/oauth.service.ts`
- **Findings**:
  - `OAuthService` はコンストラクタで `InvitationService` を DI で受け取っている
  - `handleOAuthRegistrationWithInvitation` メソッド内で `verifyInvitation` → ユーザー作成 → `useInvitation` の順で処理している
  - 管理者メールは `configService.isAdminEmail` で判定し、招待コード検証をスキップしている
- **Implications**: `AuthService.register` でも同一パターンを踏襲する。管理者メールの場合は招待コード検証をスキップしてユーザーを `ADMIN` ロールで作成する

### AuthController.register の現状分析

- **Context**: コントローラーから除去すべき招待ロジックを特定する
- **Sources Consulted**: `backend/src/auth/auth.controller.ts` (L99–L121)
- **Findings**:
  - `invitationService.verifyInvitation(invitationCode)` をコントローラーが直接呼び出している
  - `invitationService.useInvitation(invitationCode)` をコントローラーが直接呼び出している
  - `authService.register` は `_invitationCode` として受け取っているが未使用（`_` プレフィックス）
  - コントローラーは `InvitationService` をコンストラクタ注入している
- **Implications**: `register` エンドポイント内の招待検証ロジックを `AuthService.register` に移動後、コントローラーから `InvitationService` の直接呼び出しを削除する。ただし他エンドポイントは `InvitationService` を使用していないため、コントローラーからの DI 注入も削除可能

### AuthService の既存テスト構造

- **Context**: テスト更新範囲とモックパターンを把握する
- **Sources Consulted**: `backend/src/auth/auth.service.spec.ts`
- **Findings**:
  - `describe('register')` ブロックに4テストケースが存在する
  - `InvitationService` はモックされていない（現在 `AuthService` が `InvitationService` に依存していないため）
  - `mockConfigService.isAdminEmail` は `jest.fn()` でモック済み
- **Implications**: `AuthService` に `InvitationService` を追加後、テストモジュールに `mockInvitationService` を追加し、`register` の各ケースで呼び出し検証を追加する。既存テストは修正・拡張する

## Architecture Pattern Evaluation

| Option                         | Description                                                      | Strengths                            | Risks / Limitations                                                 | Notes                                |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------ |
| InvitationModule をインポート  | `AuthModule.imports` に `InvitationModule` を追加                | 正規の NestJS モジュール依存         | `InvitationModule` が `AuthModule` に依存しており循環依存が発生する | 採用不可                             |
| forwardRef による循環解決      | `forwardRef(() => InvitationModule)` で循環依存を解決            | NestJS 公式サポートあり              | 初期化順序の複雑化・テストでの扱いが難しくなる                      | 過剰。現状の直接プロバイダ登録で十分 |
| 直接プロバイダ登録（現状維持） | `AuthModule.providers` に `InvitationService` を直接追加し続ける | シンプル・循環依存なし・既存パターン | モジュール境界が若干曖昧になる                                      | **採用**。既存コードと一貫性あり     |

## Design Decisions

### Decision: `AuthModule` への `InvitationModule` インポートは行わない

- **Context**: Requirement 2.1 は `InvitationModule` を `imports` に追加するよう記述しているが、循環依存が発生する
- **Alternatives Considered**:
  1. `InvitationModule` を `imports` に追加（循環依存 → 不可）
  2. `forwardRef` を使った循環依存解決（複雑化 → 不採用）
  3. 現状の直接プロバイダ登録パターン維持（採用）
- **Selected Approach**: `AuthModule.providers` に `InvitationService` を直接登録する既存アプローチを維持し、`AuthService` のコンストラクタに `InvitationService` を追加するのみ
- **Rationale**: すでに `InvitationService` が `providers` に登録されており DI コンテナで解決可能。`InvitationModule` インポートは循環依存を引き起こすため不要
- **Trade-offs**: モジュール境界の純粋性は若干下がるが、アプリケーションの安定性と単純さを優先
- **Follow-up**: 将来的に `InvitationModule` と `AuthModule` の循環依存を解消するには、共通の `UserModule` や `CoreModule` への分離が有効だが、現リファクタリングのスコープ外

### Decision: コントローラーからの InvitationService DI 注入を維持

- **Context**: `AuthController` は `InvitationService` をコンストラクタ注入しているが、`register` 以外では使用していない
- **Alternatives Considered**:
  1. コントローラーから `InvitationService` の注入を完全削除（このリファクタリング）
  2. コントローラーに残して将来拡張に備える（現状維持 → 不採用）
- **Selected Approach**: `AuthController` のコンストラクタから `InvitationService` を削除し、`register` 内の直接呼び出しも削除する
- **Rationale**: Requirement 3.2 の要件に直接対応。コントローラーの依存を最小化する
- **Trade-offs**: なし。他のエンドポイントは `InvitationService` を使用していない

## Risks & Mitigations

- **管理者メールの招待スキップ漏れ**: `AuthService.register` で `isAdminEmail` チェックを招待検証より先に行い、管理者の場合は即座にユーザー作成へ進む
- **ユーザー作成失敗時の `useInvitation` 呼び出し**: ユーザー作成が成功した後にのみ `useInvitation` を呼び出す。Prisma の `create` が例外をスローした場合は `useInvitation` が呼ばれない設計にする
- **既存テストの破壊**: `AuthService` のコンストラクタ変更により既存テストが失敗する。`mockInvitationService` を追加して修正が必要

## References

- NestJS Circular Dependency 公式ドキュメント: https://docs.nestjs.com/fundamentals/circular-dependency
- 既存パターン: `backend/src/auth/oauth.service.ts` — OAuthService での InvitationService 利用例
