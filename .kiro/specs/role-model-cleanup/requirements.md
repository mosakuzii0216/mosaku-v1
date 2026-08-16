# Requirements Document

## Introduction

現在のコードベースには FREE・PREMIUM・ADMIN の3ロールが定義されているが、PREMIUM ロールは機能が実装されておらず、実際に使われていない。ロールモデルを USER（旧 FREE）と ADMIN の2種類に整理し、コードベース全体の一貫性を確保する。

## Requirements

### Requirement 1: Prisma スキーマのロール定義更新

**Objective:** 開発者として、DBスキーマのロール定義を実態に合わせたいので、使われていない PREMIUM ロールを削除し USER/ADMIN の2値に整理したい。

#### Acceptance Criteria

1. The システム shall `UserRole` enum を `USER` と `ADMIN` の2値のみで定義する。
2. When Prisma マイグレーションを実行したとき、the システム shall 既存の `FREE` ロールを持つユーザーレコードを `USER` に変換する。
3. If `PREMIUM` ロールを参照するコードが残存している場合、the システム shall TypeScript のコンパイルエラーを発生させて検出可能にする。

---

### Requirement 2: バックエンドのロール参照統一

**Objective:** 開発者として、バックエンドのロール割り当てロジックを整理したいので、`FREE` を返しているすべての箇所を `USER` に変更したい。

#### Acceptance Criteria

1. When 新規ユーザーをメール/パスワードで登録したとき、the Auth Service shall ロールを `USER` として作成する。
2. When 新規ユーザーを OAuth（Google/GitHub）で登録したとき、the Auth Service shall ロールを `USER` として作成する。
3. The システム shall `PREMIUM_FEATURES` フィーチャーフラグを削除する。
4. The システム shall `LEGACY_SYNC_ENDPOINTS` フィーチャーフラグを削除する（別タスク B-3 と合わせて）。

---

### Requirement 3: フロントエンドの型定義・UI更新

**Objective:** 開発者として、フロントエンドの型定義をバックエンドの実態に合わせたいので、`UserRole` 型から `FREE` と `PREMIUM` を削除したい。

#### Acceptance Criteria

1. The フロントエンド shall `UserRole` 型を `'USER' | 'ADMIN'` のみで定義する。
2. The フロントエンド shall `PREMIUM_UI` フィーチャーフラグへの参照を削除する。
3. If `role === 'ADMIN'` の条件分岐がある場合、the フロントエンド shall その条件分岐を維持する（管理者判定ロジックは保持）。
4. While アプリが動作中、the フロントエンド shall `FREE` または `PREMIUM` ロールの存在を前提とするUI要素を表示しない。

---

### Requirement 4: 後方互換性の確保

**Objective:** 運用者として、マイグレーション時に既存ユーザーデータが壊れないようにしたいので、ロール変換を安全に行いたい。

#### Acceptance Criteria

1. When マイグレーションを実行したとき、the システム shall 既存の `FREE` ロールユーザーを `USER` に変換し、データを失わない。
2. The システム shall `ADMIN` ロールを持つ既存ユーザーのロールを変更しない。
3. If マイグレーション中にエラーが発生した場合、the システム shall ロールバック可能な状態を維持する。
