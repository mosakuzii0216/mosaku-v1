import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.supabase から環境変数を読み込む
dotenv.config({ path: path.resolve(__dirname, '../../.env.supabase') });

// 環境変数から接続文字列を取得
const localDbUrl = process.env.DATABASE_URL_LOCAL || 'postgresql://myuser:mypassword@localhost:5432/memodb?schema=public';
const supabaseDbUrl = process.env.DIRECT_URL;

if (!supabaseDbUrl) {
  console.error('❌ Error: DIRECT_URL environment variable is not set');
  process.exit(1);
}

// ローカル DB 接続
const localDb = new PrismaClient({
  datasources: {
    db: {
      url: localDbUrl,
    },
  },
});

// Supabase DB 接続
const supabaseDb = new PrismaClient({
  datasources: {
    db: {
      url: supabaseDbUrl,
    },
  },
});

async function migrateData() {
  console.log('🚀 Starting data migration to Supabase...\n');

  try {
    // 1. Users
    console.log('📦 Migrating users...');
    const users = await localDb.user.findMany();
    for (const user of users) {
      await supabaseDb.user.upsert({
        where: { id: user.id },
        update: {},
        create: user,
      });
    }
    console.log(`✓ Migrated ${users.length} users\n`);

    // 2. Invitation Codes
    console.log('📦 Migrating invitation codes...');
    const invitations = await localDb.invitationCode.findMany();
    for (const inv of invitations) {
      await supabaseDb.invitationCode.upsert({
        where: { id: inv.id },
        update: {},
        create: inv,
      });
    }
    console.log(`✓ Migrated ${invitations.length} invitation codes\n`);

    // 3. Categories
    console.log('📦 Migrating categories...');
    const categories = await localDb.category.findMany();
    for (const cat of categories) {
      await supabaseDb.category.upsert({
        where: { id: cat.id },
        update: {},
        create: cat,
      });
    }
    console.log(`✓ Migrated ${categories.length} categories\n`);

    // 4. Themes
    console.log('📦 Migrating themes...');
    const themes = await localDb.theme.findMany();
    for (const theme of themes) {
      await supabaseDb.theme.upsert({
        where: { id: theme.id },
        update: {},
        create: theme,
      });
    }
    console.log(`✓ Migrated ${themes.length} themes\n`);

    // 5. Notebooks
    console.log('📦 Migrating notebooks...');
    const notebooks = await localDb.notebook.findMany();
    for (const notebook of notebooks) {
      await supabaseDb.notebook.upsert({
        where: { id: notebook.id },
        update: {},
        create: notebook,
      });
    }
    console.log(`✓ Migrated ${notebooks.length} notebooks\n`);

    // 6. Tags
    console.log('📦 Migrating tags...');
    const tags = await localDb.tag.findMany();
    for (const tag of tags) {
      await supabaseDb.tag.upsert({
        where: { id: tag.id },
        update: {},
        create: tag,
      });
    }
    console.log(`✓ Migrated ${tags.length} tags\n`);

    // 7. Memos
    console.log('📦 Migrating memos...');
    const memos = await localDb.memo.findMany();
    for (const memo of memos) {
      await supabaseDb.memo.upsert({
        where: { id: memo.id },
        update: {},
        create: memo,
      });
    }
    console.log(`✓ Migrated ${memos.length} memos\n`);

    // 8. MemoTags
    console.log('📦 Migrating memo tags...');
    const memoTags = await localDb.memoTag.findMany();
    for (const mt of memoTags) {
      await supabaseDb.memoTag.upsert({
        where: { memoId_tagId: { memoId: mt.memoId, tagId: mt.tagId } },
        update: {},
        create: mt,
      });
    }
    console.log(`✓ Migrated ${memoTags.length} memo tags\n`);

    // 9. NotebookTags
    console.log('📦 Migrating notebook tags...');
    const notebookTags = await localDb.notebookTag.findMany();
    for (const nt of notebookTags) {
      await supabaseDb.notebookTag.upsert({
        where: { notebookId_tagId: { notebookId: nt.notebookId, tagId: nt.tagId } },
        update: {},
        create: nt,
      });
    }
    console.log(`✓ Migrated ${notebookTags.length} notebook tags\n`);

    // 10. UserFavoriteThemes
    console.log('📦 Migrating user favorite themes...');
    const favThemes = await localDb.userFavoriteTheme.findMany();
    for (const fav of favThemes) {
      await supabaseDb.userFavoriteTheme.upsert({
        where: { userId_themeId: { userId: fav.userId, themeId: fav.themeId } },
        update: {},
        create: fav,
      });
    }
    console.log(`✓ Migrated ${favThemes.length} favorite themes\n`);

    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Users: ${users.length}`);
    console.log(`   Invitation Codes: ${invitations.length}`);
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Themes: ${themes.length}`);
    console.log(`   Notebooks: ${notebooks.length}`);
    console.log(`   Tags: ${tags.length}`);
    console.log(`   Memos: ${memos.length}`);
    console.log(`   Memo Tags: ${memoTags.length}`);
    console.log(`   Notebook Tags: ${notebookTags.length}`);
    console.log(`   Favorite Themes: ${favThemes.length}`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await localDb.$disconnect();
    await supabaseDb.$disconnect();
  }
}

migrateData();
