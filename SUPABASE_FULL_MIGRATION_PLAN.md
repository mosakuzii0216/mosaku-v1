# Supabase完全移行計画（DB + 認証）

Docker ComposerのPostgreSQLとPassport認証から、Supabase PostgreSQL + Supabase Authへの完全移行計画です。

## 🎯 移行戦略

### 推奨アプローチ: DB移行 → 認証移行（2段階方式）

```
第1段階: データベース移行（3-4日）
  ↓
第2段階: 認証システム移行（6-8日）
```

**理由**:
1. **リスクの分散**: 一度に変更する箇所を最小化
2. **デバッグの容易性**: 問題が起きた時に原因を特定しやすい
3. **ロールバックの簡便性**: 各段階でロールバックポイントを持つ
4. **Supabase環境の準備**: DB移行でSupabase環境が整い、認証移行がスムーズ

---

## 📊 全体のタイムライン

```
[第1段階] データベース移行: 3-4日
├─ Phase A: 準備・セットアップ (1日)
├─ Phase B: データ移行 (1日)
├─ Phase C: 切り替えとテスト (1日)
└─ Phase D: クリーンアップ (0.5日)

[第2段階] 認証システム移行: 6-8日
├─ Phase 1: 準備・セットアップ (1日)
├─ Phase 2: Supabase Auth実装 (2-3日)
├─ Phase 3: 動作確認・テスト (1日)
├─ Phase 4: 段階的な切り替え (1-2日)
└─ Phase 5: 旧認証削除 (1日)

合計: 9-12日
```

---

# 第1段階: データベース移行（3-4日）

## 🎯 Phase A: 準備・セットアップ（1日目）

### タスクA.1: Supabaseデータベースの準備

**作業内容**:

1. **Supabaseダッシュボードでデータベース情報を取得**

```bash
# Supabase Dashboard > Project Settings > Database

# Connection String (Direct)
postgres://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Connection String (Pooling - Transaction mode) ← これを使用
postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

2. **新しい環境変数ファイルを作成**

`.env.supabase`を作成（既存の.envはバックアップとして残す）:

```bash
# .env.supabase

# ===================================
# Supabase Database Settings
# ===================================
# Connection pooling (推奨): 通常のアプリケーション接続用
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&schema=public"

# Direct connection: マイグレーション実行時のみ使用
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public"

# Supabase Settings (既存と同じ)
SUPABASE_URL=https://pxrouvdpdffdfoitmoyv.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Frontend Settings
VITE_SUPABASE_URL=https://pxrouvdpdffdfoitmoyv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_APP_URL=http://localhost:5173
VITE_BACKEND_URL=http://localhost:3000

# Admin Settings
ADMIN_EMAIL=mosakuzii1928@gmail.com

# 認証設定（既存のまま - 第2段階で削除）
JWT_SECRET=your-secret-key-change-this-in-production
SESSION_SECRET=your-session-secret-change-this-in-production
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# ... 他の認証設定
```

3. **Prisma schemaの更新**

`backend/prisma/schema.prisma`の`datasource`を更新:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // 追加（マイグレーション用）
}
```

**成果物**:
- ✅ Supabaseデータベース接続情報取得済み
- ✅ `.env.supabase`ファイル作成済み
- ✅ Prisma schemaに`directUrl`追加済み

---

### タスクA.2: ローカルデータのバックアップ

**作業内容**:

```bash
# 現在のDocker PostgreSQLからデータをエクスポート
docker exec -t memo-app-db pg_dump -U myuser -d memodb > backup_$(date +%Y%m%d_%H%M%S).sql

# バックアップの確認
ls -lh backup_*.sql
```

**成果物**:
- ✅ ローカルDBのバックアップファイル作成済み

---

### タスクA.3: Supabaseへのマイグレーション適用

**作業内容**:

```bash
# .env.supabaseを使用してマイグレーション実行
cd backend

# 環境変数ファイルを一時的に切り替え
cp .env .env.local.backup
cp .env.supabase .env

# Supabaseにマイグレーションを適用
npx prisma migrate deploy

# Prismaクライアントを再生成
npx prisma generate

# 環境変数を元に戻す（まだローカルDBを使用）
cp .env.local.backup .env
```

**Supabase SQL Editorで確認**:
```sql
-- テーブルが作成されたことを確認
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 件数確認（まだ0件のはず）
SELECT
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'memos', COUNT(*) FROM memos
UNION ALL
SELECT 'notebooks', COUNT(*) FROM notebooks
UNION ALL
SELECT 'tags', COUNT(*) FROM tags;
```

**成果物**:
- ✅ Supabaseにスキーマが作成済み
- ✅ ローカル環境は引き続きローカルDBを使用

---

## 🔄 Phase B: データ移行（2日目）

### タスクB.1: データエクスポート・インポート戦略の選択

**オプション1: pg_dump/pg_restore（推奨 - データが多い場合）**

```bash
# ローカルDBからデータをエクスポート（スキーマなし、データのみ）
docker exec -t memo-app-db pg_dump -U myuser -d memodb \
  --data-only \
  --no-owner \
  --no-privileges \
  > data_export.sql

# Supabaseにインポート
# Supabaseのパスワードを環境変数に設定
export PGPASSWORD='your-supabase-password'

psql "postgresql://postgres.[PROJECT-REF]:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f data_export.sql

# 成功確認
psql "postgresql://postgres.[PROJECT-REF]:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM memos;"
```

**オプション2: Prismaスクリプト（推奨 - データが少ない場合）**

新規ファイル作成: `backend/scripts/migrate-data-to-supabase.ts`

```typescript
import { PrismaClient as LocalPrismaClient } from '@prisma/client';
import { PrismaClient as SupabasePrismaClient } from '@prisma/client';

// ローカルDB接続
const localDb = new LocalPrismaClient({
  datasources: {
    db: {
      url: 'postgresql://myuser:mypassword@localhost:5432/memodb?schema=public',
    },
  },
});

// SupabaseDB接続
const supabaseDb = new SupabasePrismaClient({
  datasources: {
    db: {
      url: process.env.SUPABASE_DATABASE_URL,
    },
  },
});

async function migrateData() {
  console.log('Starting data migration...');

  // 1. Users
  console.log('Migrating users...');
  const users = await localDb.user.findMany();
  for (const user of users) {
    await supabaseDb.user.upsert({
      where: { id: user.id },
      update: {},
      create: user,
    });
  }
  console.log(`✓ Migrated ${users.length} users`);

  // 2. Invitation Codes
  console.log('Migrating invitation codes...');
  const invitations = await localDb.invitationCode.findMany();
  for (const inv of invitations) {
    await supabaseDb.invitationCode.upsert({
      where: { id: inv.id },
      update: {},
      create: inv,
    });
  }
  console.log(`✓ Migrated ${invitations.length} invitation codes`);

  // 3. Notebooks
  console.log('Migrating notebooks...');
  const notebooks = await localDb.notebook.findMany();
  for (const notebook of notebooks) {
    await supabaseDb.notebook.upsert({
      where: { id: notebook.id },
      update: {},
      create: notebook,
    });
  }
  console.log(`✓ Migrated ${notebooks.length} notebooks`);

  // 4. Tags
  console.log('Migrating tags...');
  const tags = await localDb.tag.findMany();
  for (const tag of tags) {
    await supabaseDb.tag.upsert({
      where: { id: tag.id },
      update: {},
      create: tag,
    });
  }
  console.log(`✓ Migrated ${tags.length} tags`);

  // 5. Memos
  console.log('Migrating memos...');
  const memos = await localDb.memo.findMany();
  for (const memo of memos) {
    await supabaseDb.memo.upsert({
      where: { id: memo.id },
      update: {},
      create: memo,
    });
  }
  console.log(`✓ Migrated ${memos.length} memos`);

  // 6. MemoTags
  console.log('Migrating memo tags...');
  const memoTags = await localDb.memoTag.findMany();
  for (const mt of memoTags) {
    await supabaseDb.memoTag.upsert({
      where: { memoId_tagId: { memoId: mt.memoId, tagId: mt.tagId } },
      update: {},
      create: mt,
    });
  }
  console.log(`✓ Migrated ${memoTags.length} memo tags`);

  // 7. NotebookTags
  console.log('Migrating notebook tags...');
  const notebookTags = await localDb.notebookTag.findMany();
  for (const nt of notebookTags) {
    await supabaseDb.notebookTag.upsert({
      where: { notebookId_tagId: { notebookId: nt.notebookId, tagId: nt.tagId } },
      update: {},
      create: nt,
    });
  }
  console.log(`✓ Migrated ${notebookTags.length} notebook tags`);

  // 8. Themes & Categories
  console.log('Migrating categories...');
  const categories = await localDb.category.findMany();
  for (const cat of categories) {
    await supabaseDb.category.upsert({
      where: { id: cat.id },
      update: {},
      create: cat,
    });
  }
  console.log(`✓ Migrated ${categories.length} categories`);

  console.log('Migrating themes...');
  const themes = await localDb.theme.findMany();
  for (const theme of themes) {
    await supabaseDb.theme.upsert({
      where: { id: theme.id },
      update: {},
      create: theme,
    });
  }
  console.log(`✓ Migrated ${themes.length} themes`);

  // 9. UserFavoriteThemes
  console.log('Migrating user favorite themes...');
  const favThemes = await localDb.userFavoriteTheme.findMany();
  for (const fav of favThemes) {
    await supabaseDb.userFavoriteTheme.upsert({
      where: { userId_themeId: { userId: fav.userId, themeId: fav.themeId } },
      update: {},
      create: fav,
    });
  }
  console.log(`✓ Migrated ${favThemes.length} favorite themes`);

  console.log('✅ Migration completed successfully!');
}

migrateData()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await localDb.$disconnect();
    await supabaseDb.$disconnect();
  });
```

**package.jsonにスクリプト追加**:
```json
{
  "scripts": {
    "migrate:to-supabase": "tsx scripts/migrate-data-to-supabase.ts"
  }
}
```

**実行**:
```bash
# tsx をインストール（まだの場合）
npm install -D tsx

# 環境変数を設定
export SUPABASE_DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public"

# 実行
npm run migrate:to-supabase
```

**成果物**:
- ✅ すべてのデータがSupabaseに移行済み
- ✅ データ整合性が確認済み

---

### タスクB.2: データ検証

**Supabase SQL Editorで確認**:

```sql
-- 件数比較
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'memos', COUNT(*) FROM memos
UNION ALL
SELECT 'notebooks', COUNT(*) FROM notebooks
UNION ALL
SELECT 'tags', COUNT(*) FROM tags
UNION ALL
SELECT 'memo_tags', COUNT(*) FROM memo_tags
UNION ALL
SELECT 'notebook_tags', COUNT(*) FROM notebook_tags
UNION ALL
SELECT 'themes', COUNT(*) FROM themes
UNION ALL
SELECT 'categories', COUNT(*) FROM categories;

-- 最新レコードの確認
SELECT * FROM users ORDER BY created_at DESC LIMIT 5;
SELECT * FROM memos ORDER BY updated_at DESC LIMIT 5;
```

**ローカルDBと比較**:
```bash
docker exec -it memo-app-db psql -U myuser -d memodb -c "
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'memos', COUNT(*) FROM memos;
"
```

**成果物**:
- ✅ データ件数が一致
- ✅ 主要データの内容が一致

---

## 🔄 Phase C: 切り替えとテスト（3日目）

### タスクC.1: 環境変数の切り替え

**作業内容**:

```bash
# .envを Supabase用に切り替え
cd /Users/onotakashi/mosaku
cp .env .env.local.backup  # バックアップ
cp .env.supabase .env

# バックエンドを再起動してSupabase接続を確認
cd backend
npm run start:dev
```

**動作確認**:
```bash
# ログにエラーがないか確認
# 正常に起動したら、APIをテスト

curl http://localhost:3000/memo
# データが返ってくることを確認
```

**成果物**:
- ✅ バックエンドがSupabase DBに接続済み
- ✅ API経由でデータ取得可能

---

### タスクC.2: E2Eテスト

**作業内容**:

1. **フロントエンドを起動**:
```bash
cd frontend
npm run dev
```

2. **手動テスト**:
- [ ] ログインできる
- [ ] メモ一覧が表示される
- [ ] 新規メモ作成ができる
- [ ] メモ編集ができる
- [ ] メモ削除ができる
- [ ] タグ操作ができる
- [ ] ノートブック操作ができる
- [ ] テーマ切り替えができる

3. **自動テスト**:
```bash
cd backend
npm run test:e2e
```

**問題が発生した場合のロールバック**:
```bash
# .envを元に戻す
cp .env.local.backup .env

# バックエンド再起動
npm run start:dev
```

**成果物**:
- ✅ すべての機能が正常動作
- ✅ データの読み書きが正常

---

### タスクC.3: パフォーマンステスト

**作業内容**:

```bash
# レスポンスタイムの計測
time curl http://localhost:3000/memo

# 負荷テスト（オプション）
# Apache Bench でテスト
ab -n 100 -c 10 http://localhost:3000/memo
```

**確認項目**:
- ✅ レスポンスタイムが許容範囲内（< 500ms）
- ✅ 大量データでもパフォーマンス問題なし

---

## 🗑️ Phase D: クリーンアップ（3.5-4日目）

### タスクD.1: Docker Compose設定の更新

**作業内容**:

`docker-compose.yml`からdbサービスを削除またはコメントアウト:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      target: development
    container_name: memo-app-backend
    volumes:
      - ./backend/src:/usr/src/app/src
      - ./backend/prisma:/usr/src/app/prisma
      # ... 他のボリューム
    ports:
      - "3000:3000"
    # depends_on:
    #   - db  # 削除
    env_file: ./.env
    restart: unless-stopped

  frontend:
    # ... そのまま

  # データベース (PostgreSQL) サービス - Supabaseを使うため不要
  # db:
  #   image: postgres:16-alpine
  #   container_name: memo-app-db
  #   volumes:
  #     - postgres_data:/var/lib/postgresql/data
  #   ports:
  #     - "5432:5432"
  #   env_file: ./.env
  #   restart: unless-stopped

  nginx:
    # ... そのまま

# volumes:
#   postgres_data:  # Supabaseを使うため不要
```

**動作確認**:
```bash
# Docker Compose再起動
docker-compose down
docker-compose up -d

# バックエンドが正常に起動することを確認
docker logs -f memo-app-backend
```

**成果物**:
- ✅ ローカルPostgreSQLコンテナが停止
- ✅ アプリケーションはSupabase DBを使用

---

### タスクD.2: 環境変数のクリーンアップ

**作業内容**:

`.env`からローカルDB関連の変数を削除:

```bash
# 削除する変数
POSTGRES_USER=myuser
POSTGRES_PASSWORD=mypassword
POSTGRES_DB=memodb
# DATABASE_URL と DIRECT_URL は Supabase用に更新済みなので残す
```

**成果物**:
- ✅ `.env`ファイルがクリーンアップ済み

---

### タスクD.3: ドキュメント更新

**作業内容**:

`README.md`と`CLAUDE.md`を更新:

```markdown
## データベース

- **本番環境**: Supabase PostgreSQL
- **開発環境**: Supabase PostgreSQL（ローカルPostgreSQLは廃止）

## セットアップ

### 環境変数の設定

`.env`ファイルに以下を設定：

```bash
# Supabase Database
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&schema=public"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public"
```

### マイグレーション

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```
```

**成果物**:
- ✅ ドキュメントが最新状態に更新済み

---

## ✅ 第1段階完了チェックリスト

- [ ] Supabaseにスキーマが作成済み
- [ ] 既存データがSupabaseに移行済み
- [ ] データ整合性が確認済み
- [ ] アプリケーションがSupabase DBで動作
- [ ] すべての機能がテスト済み
- [ ] ローカルPostgreSQLが停止
- [ ] ドキュメントが更新済み

---

# 第2段階: 認証システム移行（6-8日）

**詳細は `SUPABASE_AUTH_MIGRATION_PLAN.md` を参照**

第1段階が完了し、データベースがSupabaseに移行済みの状態で、認証システムの移行を開始します。

## 簡易版タイムライン

1. **Phase 1: 準備・セットアップ（1日）**
   - Supabase Authの有効化
   - `supabaseUserId`カラム追加
   - Supabase SDK インストール

2. **Phase 2: Supabase Auth実装（2-3日）**
   - SupabaseService, SupabaseAuthGuard作成
   - フロントエンドフック作成
   - 既存認証と並行稼働

3. **Phase 3: 動作確認・テスト（1日）**
   - 新規登録・ログインテスト
   - 招待コードシステム統合

4. **Phase 4: 段階的な切り替え（1-2日）**
   - エンドポイントを順次切り替え
   - フロントエンドUI更新

5. **Phase 5: 旧認証削除（1日）**
   - Passport関連コード削除
   - npm依存関係削除
   - 環境変数クリーンアップ

---

## 🎯 移行の全体フロー（統合版）

```
Week 1:
├─ Day 1: DB移行 - 準備
├─ Day 2: DB移行 - データ移行
├─ Day 3: DB移行 - 切り替え・テスト
└─ Day 4: DB移行 - クリーンアップ

Week 2:
├─ Day 5: 認証移行 - 準備
├─ Day 6-7: 認証移行 - 実装
└─ Day 8: 認証移行 - テスト

Week 3:
├─ Day 9-10: 認証移行 - 切り替え
└─ Day 11-12: 認証移行 - クリーンアップ・最終確認
```

---

## 🛡️ リスク管理

### ロールバックポイント

1. **Phase A完了時**: Supabaseにスキーマ作成済み、データ未移行
   - ロールバック: Supabaseテーブルをdrop

2. **Phase B完了時**: データ移行済み、まだローカルDB使用
   - ロールバック: .envを元に戻す

3. **Phase C完了時**: Supabase DB使用中
   - ロールバック: .envを元に戻し、ローカルDB再起動

4. **Phase D完了時**: ローカルDB停止済み
   - ロールバック: docker-compose.yml復元、ローカルDB再起動

### バックアップ戦略

- **毎日**: Supabaseの自動バックアップを確認
- **各Phase前**: `pg_dump`で手動バックアップ
- **Git**: 各Phaseでコミット

---

## 📝 次のアクション

第1段階（DB移行）から始めますか？

準備ができたら「Phase Aを開始します」と伝えてください。
