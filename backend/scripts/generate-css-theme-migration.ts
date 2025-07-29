import { themeDefinitions } from '../src/data/theme-definitions';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * CSS参照型テーマからPrisma migration SQLを生成するスクリプト
 */

interface ThemeWithCSS {
  id: string;
  name: string;
  description: string;
  category: string;
  isSystem: boolean;
  isPublic: boolean;
  cssContent: string; // CSSファイルの内容
  version: string;
  accessibility?: any;
}

function readCSSFile(cssFileName: string): string {
  const cssPath = join(__dirname, '..', 'src', 'themes', 'css', cssFileName);
  
  if (!existsSync(cssPath)) {
    console.warn(`⚠️  CSSファイルが見つかりません: ${cssPath}`);
    return `/* CSSファイル ${cssFileName} が見つかりません */`;
  }
  
  try {
    return readFileSync(cssPath, 'utf8');
  } catch (error) {
    console.error(`❌ CSSファイル読み込みエラー: ${cssFileName}`, error);
    return `/* CSSファイル読み込みエラー: ${cssFileName} */`;
  }
}

function generateCSSThemeMigrationSQL(): string {
  const sql: string[] = [];
  
  // コメントヘッダー
  sql.push('-- CSS参照型テーマプリセットデータを投入するmigration');
  sql.push('-- 既存のシステムテーマを削除してから新しいテーマを投入');
  sql.push('-- 各テーマのCSSコンテンツはstylesカラムに格納');
  sql.push('');
  
  // 既存のシステムテーマを削除
  sql.push('-- 既存のシステムテーマを削除');
  sql.push(`DELETE FROM "themes" WHERE "isSystem" = true;`);
  sql.push('');
  
  // CSS内容を読み込んでテーマデータを作成
  const themesWithCSS: ThemeWithCSS[] = [];
  
  console.log('📁 CSSファイルを読み込み中...');
  
  for (const theme of themeDefinitions) {
    const cssContent = readCSSFile(theme.cssFile);
    
    // テーマデータとしてはCSSコンテンツをstyles.cssContentに格納
    const themeWithCSS: ThemeWithCSS = {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      category: theme.category,
      isSystem: theme.isSystem,
      isPublic: theme.isPublic,
      cssContent,
      version: theme.version,
      accessibility: theme.accessibility,
    };
    
    themesWithCSS.push(themeWithCSS);
    console.log(`  ✅ ${theme.name} (${theme.cssFile}) - ${cssContent.length} chars`);
  }
  
  // 各テーマのINSERT文を生成
  sql.push('-- CSS参照型テーマプリセットデータを投入');
  
  themesWithCSS.forEach((theme) => {
    // スタイルデータとしてはCSSContent + メタデータを格納
    const stylesData = {
      cssContent: theme.cssContent,
      version: theme.version,
      type: 'css-based',
      accessibility: theme.accessibility || null,
    };
    
    const stylesJson = JSON.stringify(stylesData);
    // JSONの中のダブルクォートとシングルクォートをエスケープ
    const escapedStylesJson = stylesJson.replace(/'/g, "''");
    
    sql.push(
      `INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "styles", "createdAt", "updatedAt", "created_by_id") VALUES` +
      ` ('${theme.id}', '${theme.name}', '${theme.description}', ${theme.isSystem}, ${theme.isPublic}, '${escapedStylesJson}', NOW(), NOW(), NULL);`
    );
  });
  
  sql.push('');
  sql.push(`-- ${themesWithCSS.length}個のCSS参照型テーマプリセットを投入しました`);
  
  return sql.join('\n');
}

function main() {
  try {
    console.log('🎨 CSS参照型テーマmigration SQLを生成中...');
    
    const migrationSQL = generateCSSThemeMigrationSQL();
    
    // 新しいmigrationファイルを作成
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const migrationName = `${timestamp}_insert_css_based_theme_presets`;
    const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');
    const migrationDir = join(migrationsDir, migrationName);
    const migrationFilePath = join(migrationDir, 'migration.sql');
    
    // migrationディレクトリを作成
    const { mkdirSync } = require('fs');
    mkdirSync(migrationDir, { recursive: true });
    
    // migration.sqlファイルに書き込み
    writeFileSync(migrationFilePath, migrationSQL + '\\n', 'utf8');
    
    console.log('✅ CSS参照型migration SQLファイルを生成しました:');
    console.log(`📁 ${migrationFilePath}`);
    console.log(`📊 ${themeDefinitions.length}個のテーマプリセットを含むSQLを生成`);
    console.log('');
    console.log('次のステップ:');
    console.log('  npm run migration:apply  # migrationを適用');
    console.log('  または');
    console.log(`  npx prisma migrate dev --name css_based_theme_presets`);
    
  } catch (error) {
    console.error('❌ CSS参照型migration SQL生成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { generateCSSThemeMigrationSQL };