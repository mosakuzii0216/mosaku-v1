import { PrismaClient } from '@prisma/client';
import { themePresets } from '../src/data/theme-presets';

const prisma = new PrismaClient();

/**
 * テーマのシードデータを投入する
 * 
 * 注意: このファイルは後方互換性のために残していますが、
 * 推奨される方法はPrisma migrationを使用することです:
 * 
 * 推奨: npm run migration:apply
 * 代替: npm run seed:themes
 */
async function seedThemes() {
  console.log('🎨 テーマのシードデータを投入中...');

  // 既存のシステムテーマを削除（開発環境での再実行用）
  await prisma.theme.deleteMany({
    where: {
      isSystem: true
    }
  });

  console.log('📝 既存のシステムテーマを削除しました');

  // プリセットテーマを投入
  const createdThemes: any[] = [];
  
  for (const preset of themePresets) {
    const theme = await prisma.theme.create({
      data: {
        name: preset.name,
        description: preset.description,
        isSystem: preset.isSystem,
        isPublic: preset.isPublic,
        styles: preset.styles as any,
        createdById: null // システムテーマなので作成者なし
      }
    });
    
    createdThemes.push(theme);
    console.log(`✅ テーマ「${preset.name}」を作成しました (ID: ${theme.id})`);
  }

  console.log(`\n🎉 ${createdThemes.length}個のテーマを正常に投入しました！`);
  
  // カテゴリ別の統計を表示
  const categoryStats = themePresets.reduce((acc, theme) => {
    acc[theme.category] = (acc[theme.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n📊 カテゴリ別統計:');
  Object.entries(categoryStats).forEach(([category, count]) => {
    console.log(`  ${category}: ${count}個`);
  });

  return createdThemes;
}

/**
 * メイン実行関数
 */
async function main() {
  try {
    await seedThemes();
  } catch (error) {
    console.error('❌ シード実行中にエラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプト直接実行時のみ実行
if (require.main === module) {
  main();
}

export { seedThemes };