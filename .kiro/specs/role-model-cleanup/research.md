# Research Log: role-model-cleanup

## Discovery Type: Light（既存システムの拡張）

## Summary

既存コードへの影響範囲を調査した。ロール参照は BE/FE あわせて限定的な箇所に集中しており、破壊的変更はPrismaスキーマのenum変更のみ。PostgreSQLのenum値削除は直接サポートされないため、カスタムマイグレーションが必要。

## Investigation Log

### 影響ファイル一覧

**バックエンド（変更必要）:**

- `backend/prisma/schema.prisma` — `UserRole` enum と `User.role` デフォルト値
- `backend/src/auth/auth.service.ts` L80 — `role: 'FREE'`
- `backend/src/auth/oauth.service.ts` L111 — `role: 'FREE'`
- `backend/src/config/features.config.ts` — `PREMIUM_FEATURES`, `LEGACY_SYNC_ENDPOINTS` フラグ削除

**バックエンド（テスト修正）:**

- `backend/src/auth/auth.service.spec.ts` L17, L141, L143, L150 — `'FREE'` → `'USER'`
- `backend/src/auth/oauth.service.spec.ts` L17 — `'FREE'` → `'USER'`
- `backend/src/auth/jwt.service.spec.ts` L29, L48 — `'FREE'` → `'USER'`
- `backend/src/common/guards/admin.guard.spec.ts` L29-36 — `'FREE'`/`'PREMIUM'` のテストケースを修正

**フロントエンド（変更必要）:**

- `frontend/src/utils/auth.ts` L9, L40 — `UserProfile.role` 型を `'USER' | 'ADMIN'` に変更
- `frontend/src/constants/features.ts` — `PREMIUM_UI` フラグ削除

**変更不要（型が Prisma から自動導出）:**

- `backend/src/auth/types.ts` — `UserRole = AuthenticatedUser['role']` は Prisma 型から自動更新される

### PostgreSQL enum 変更の技術的考慮

PostgreSQL は `ALTER TYPE RENAME VALUE` で enum 値を rename できる（PostgreSQL 10+）。ただし Prisma は `ALTER TYPE RENAME VALUE` を自動生成しないため、カスタム SQL マイグレーションを手書きで作成する必要がある。

手順:

1. `prisma migrate dev --create-only` で空のマイグレーションファイルを作成
2. 以下のSQLを手動で記述:

```sql
-- FREE を USER にリネーム
ALTER TYPE "UserRole" RENAME VALUE 'FREE' TO 'USER';
-- PREMIUM を削除（参照データなしを確認済み）
ALTER TYPE "UserRole" ADD VALUE 'USER_TEMP'; -- workaround不要、直接削除は不可
```

実際には PREMIUM 削除のために:

```sql
-- 1. 新しい enum を作成
CREATE TYPE "UserRole_new" AS ENUM ('USER', 'ADMIN');
-- 2. カラムを新しい enum に変換
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (CASE role::text WHEN 'FREE' THEN 'USER'::"UserRole_new" WHEN 'ADMIN' THEN 'ADMIN'::"UserRole_new" END);
-- 3. 古い enum を削除して新しいものをリネーム
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
```

### リスク評価

- **データ損失リスク**: なし（FREE→USER変換、ADMIN維持）
- **PREMIUM ユーザーの存在**: コードロジック上 PREMIUM が割り当てられることはないが、念のためマイグレーション前に確認用 SELECT を追加
- **ロールバック**: Prisma migration は `migrate reset` でロールバック可能
