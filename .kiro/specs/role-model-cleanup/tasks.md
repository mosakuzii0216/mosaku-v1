# Implementation Plan

## Tasks

- [ ] 1. DB スキーマとマイグレーションの準備
- [x] 1.1 Prisma スキーマの UserRole enum を USER/ADMIN の2値に更新する
  - `schema.prisma` の `UserRole` enum から `FREE` と `PREMIUM` を削除し `USER` と `ADMIN` のみにする
  - `User.role` のデフォルト値を `FREE` から `USER` に変更する
  - 変更後に `npx prisma generate` を実行して型を再生成する
  - _Requirements: 1.1, 1.3_

- [x] 1.2 FREE→USER 変換の PostgreSQL カスタムマイグレーションを作成して適用する
  - `prisma migrate dev --create-only` で空のマイグレーションファイルを作成する
  - マイグレーション前に `SELECT count(*) FROM users WHERE role = 'PREMIUM'` で 0 件を確認するコメントを追加する
  - `CREATE TYPE "UserRole_new" AS ENUM ('USER', 'ADMIN')` で新 enum を作成する SQL を記述する
  - `ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING (CASE ...)` で FREE→USER, ADMIN→ADMIN に変換する SQL を記述する
  - 旧 `UserRole` を DROP して新 enum を `UserRole` にリネームする SQL を記述する
  - `prisma migrate dev` でマイグレーションを適用し、エラーがないことを確認する
  - _Requirements: 1.2, 4.1, 4.2, 4.3_

- [ ] 2. バックエンドのロール割り当てとフィーチャーフラグを修正する
- [x] 2.1 (P) メール/PW 登録時のロール割り当てを USER に変更する
  - `auth.service.ts` の新規ユーザー作成箇所で `'FREE'` を `'USER'` に変更する
  - 変更後、TypeScript のコンパイルエラーがないことを確認する
  - タスク 1.1 の `npx prisma generate` 完了後に実施すること
  - _Requirements: 2.1_

- [x] 2.2 (P) OAuth 登録時のロール割り当てを USER に変更する
  - `oauth.service.ts` の新規ユーザー作成箇所で `'FREE'` を `'USER'` に変更する
  - 変更後、TypeScript のコンパイルエラーがないことを確認する
  - タスク 1.1 の `npx prisma generate` 完了後に実施すること
  - _Requirements: 2.2_

- [x] 2.3 (P) バックエンドの未使用フィーチャーフラグを削除する
  - `features.config.ts` から `PREMIUM_FEATURES` オブジェクトを削除する
  - `features.config.ts` から `LEGACY_SYNC_ENDPOINTS` フラグを削除する
  - 削除後、これらフラグを参照している箇所がないことを TypeScript コンパイルで確認する
  - _Requirements: 2.3, 2.4_

- [ ] 3. フロントエンドの型定義とフィーチャーフラグを修正する
- [x] 3.1 (P) UserProfile の role 型を USER/ADMIN のみに変更する
  - `frontend/utils/auth.ts` の `UserProfile.role` を `'USER' | 'ADMIN'` に変更する
  - `role === 'ADMIN'` の条件分岐が残っていることを確認する（削除しない）
  - `'FREE'` や `'PREMIUM'` を前提とする型アサーションが存在すれば削除する
  - _Requirements: 3.1, 3.3, 3.4_

- [x] 3.2 (P) フロントエンドの未使用フィーチャーフラグを削除する
  - `frontend/constants/features.ts` から `PREMIUM_UI` エントリを削除する
  - 削除後、`PREMIUM_UI` を参照している箇所がないことを TypeScript コンパイルで確認する
  - _Requirements: 3.2_

- [ ] 4. バックエンドのユニットテストを修正する
- [x] 4.1 認証サービスのテストで 'FREE' / 'PREMIUM' の参照を 'USER' に更新する
  - `auth.service.spec.ts` のモック値 `'FREE'` を `'USER'` に変更する
  - `oauth.service.spec.ts` のモック値 `'FREE'` を `'USER'` に変更する
  - `jwt.service.spec.ts` のモック値 `'FREE'` を `'USER'` に変更する
  - `admin.guard.spec.ts` の `'FREE'` / `'PREMIUM'` テストケースを `'USER'` に変更する
  - `npm run test` を実行してすべてのテストがパスすることを確認する
  - タスク 2（バックエンドのサービス修正）完了後に実施すること
  - _Requirements: 1.3, 2.1, 2.2_

- [ ] 5. ビルド検証と統合確認を実施する
- [x] 5.1 バックエンドおよびフロントエンドのビルドが型エラーなしでパスすることを確認する
  - `cd backend && npm run build` を実行して TypeScript エラーがないことを確認する
  - `cd frontend && npm run build` を実行して TypeScript エラーがないことを確認する
  - `PREMIUM` / `FREE` への参照が残存している場合はコンパイルエラーが発生するため修正する
  - _Requirements: 1.3, 3.1_

- [ ] 5.2 マイグレーション後のデータ整合性を確認する
  - `SELECT role, count(*) FROM users GROUP BY role` を実行し `USER` と `ADMIN` のみが存在することを確認する
  - `PREMIUM` 行が 0 件であることを確認する
  - `ADMIN` ロールユーザーが変換前後で件数が一致することを確認する
  - _Requirements: 4.1, 4.2, 4.3_
