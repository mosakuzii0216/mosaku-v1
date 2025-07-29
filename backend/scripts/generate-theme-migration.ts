import { themePresets } from '../src/data/theme-presets';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * テーマプリセットデータからPrisma migration SQLを生成するスクリプト
 */

function generateThemeMigrationSQL(): string {
  const sql: string[] = [];
  
  // コメントヘッダー
  sql.push('-- テーマプリセットデータを投入するmigration');
  sql.push('-- 既存のシステムテーマを削除してから新しいテーマを投入');
  sql.push('');
  
  // 既存のシステムテーマを削除
  sql.push('-- 既存のシステムテーマを削除');
  sql.push(`DELETE FROM "themes" WHERE "isSystem" = true;`);
  sql.push('');
  
  // 各テーマプリセットのINSERT文を生成
  sql.push('-- テーマプリセットデータを投入');
  
  themePresets.forEach((preset, index) => {
    const themeId = `theme_preset_${index + 1}`;
    const stylesJson = JSON.stringify(preset.styles);
    // JSONの中のダブルクォートをエスケープ
    const escapedStylesJson = stylesJson.replace(/'/g, "''");
    
    sql.push(
      `INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "styles", "createdAt", "updatedAt", "createdById") VALUES` +
      ` ('${themeId}', '${preset.name}', '${preset.description}', ${preset.isSystem}, ${preset.isPublic}, '${escapedStylesJson}', NOW(), NOW(), NULL);`
    );
  });
  
  sql.push('');
  sql.push(`-- ${themePresets.length}個のテーマプリセットを投入しました`);
  
  return sql.join('\n');
}

function main() {
  try {
    console.log('🎨 テーマmigration SQLを生成中...');
    
    const migrationSQL = generateThemeMigrationSQL();
    
    // 最新のmigrationディレクトリを取得
    const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');
    const latestMigrationDir = join(migrationsDir, '20250729103602_insert_theme_presets');
    const migrationFilePath = join(latestMigrationDir, 'migration.sql');
    
    // migration.sqlファイルに書き込み
    writeFileSync(migrationFilePath, migrationSQL, 'utf8');
    
    console.log('✅ migration SQLファイルを生成しました:');
    console.log(`📁 ${migrationFilePath}`);
    console.log(`📊 ${themePresets.length}個のテーマプリセットを含むSQLを生成`);
    console.log('');
    console.log('次のステップ:');
    console.log('  npm run migration:apply  # migrationを適用');
    
  } catch (error) {
    console.error('❌ migration SQL生成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { generateThemeMigrationSQL };