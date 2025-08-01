import { cssFileThemeDefinitions } from '../src/data/css-file-theme-definitions';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * CSSファイル参照型テーマからPrisma migration SQLを生成するスクリプト
 */

function generateCSSFileThemeMigrationSQL(): string {
  const sql: string[] = [];
  
  // コメントヘッダー
  sql.push('-- CSSファイル参照型テーマプリセットデータを投入するmigration');
  sql.push('-- stylesカラム → cssFilePathカラム + metadataカラム に変更');
  sql.push('-- CSSファイルはフロントエンドの public/themes/ に配置');
  sql.push('');
  
  // まず、テーブル構造を変更（カラム追加）
  sql.push('-- テーブル構造の変更');
  sql.push('-- 新しいカラムを追加');
  sql.push('ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "css_file_path" VARCHAR(255);');
  sql.push('ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT \'{}\';');
  sql.push('');
  
  // 既存のシステムテーマを削除
  sql.push('-- 既存のシステムテーマを削除');
  sql.push(`DELETE FROM "themes" WHERE "isSystem" = true;`);
  sql.push('');
  
  // 各テーマのINSERT文を生成
  sql.push('-- CSSファイル参照型テーマプリセットデータを投入');
  
  cssFileThemeDefinitions.forEach((theme) => {
    const metadataJson = JSON.stringify(theme.metadata);
    // JSONの中のダブルクォートをエスケープ
    const escapedMetadataJson = metadataJson.replace(/'/g, "''");
    
    sql.push(
      `INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES` +
      ` ('${theme.id}', '${theme.name}', '${theme.description}', ${theme.isSystem}, ${theme.isPublic}, '${theme.cssFilePath}', '${escapedMetadataJson}', NOW(), NOW(), NULL);`
    );
  });
  
  sql.push('');
  
  // 古いstylesカラムを削除（段階的に）
  sql.push('-- 古いstylesカラムの削除（必要に応じて）');
  sql.push('-- ALTER TABLE "themes" DROP COLUMN IF EXISTS "styles";');
  sql.push('');
  
  sql.push(`-- ${cssFileThemeDefinitions.length}個のCSSファイル参照型テーマプリセットを投入しました`);
  
  return sql.join('\n');
}

function main() {
  try {
    console.log('🎨 CSSファイル参照型テーマmigration SQLを生成中...');
    
    const migrationSQL = generateCSSFileThemeMigrationSQL();
    
    // 新しいmigrationファイルを作成
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const migrationName = `${timestamp}_css_file_path_theme_system`;
    const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');
    const migrationDir = join(migrationsDir, migrationName);
    const migrationFilePath = join(migrationDir, 'migration.sql');
    
    // migrationディレクトリを作成
    const { mkdirSync } = require('fs');
    mkdirSync(migrationDir, { recursive: true });
    
    // migration.sqlファイルに書き込み
    writeFileSync(migrationFilePath, migrationSQL + '\n', 'utf8');
    
    console.log('✅ CSSファイル参照型migration SQLファイルを生成しました:');
    console.log(`📁 ${migrationFilePath}`);
    console.log(`📊 ${cssFileThemeDefinitions.length}個のテーマプリセットを含むSQLを生成`);
    console.log('');
    console.log('🔄 データベース構造の変更:');
    console.log('  - styles (JSONB) → css_file_path (VARCHAR) + metadata (JSONB)');
    console.log('  - CSSファイルは frontend/public/themes/ に配置済み');
    console.log('');
    console.log('次のステップ:');
    console.log('  npx prisma migrate dev  # migrationを適用');
    
  } catch (error) {
    console.error('❌ CSSファイル参照型migration SQL生成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { generateCSSFileThemeMigrationSQL };