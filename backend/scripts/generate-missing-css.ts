/**
 * 不足しているCSSファイルを既存のtheme-presetsから自動生成するスクリプト
 */

import { themePresets } from '../src/data/theme-presets';
import { themeDefinitions } from '../src/data/theme-definitions';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface StyleData {
  colors: Record<string, string>;
  typography: Record<string, string>;
  layout: Record<string, string>;
  animations: Record<string, string>;
  accessibility?: Record<string, any>;
}

function convertStylesDataToCSS(id: string, name: string, description: string, styles: StyleData): string {
  const css: string[] = [];
  
  // コメントヘッダー
  css.push(`/* ${name} - ${description} */`);
  css.push('');
  
  // CSS変数定義
  css.push(':root {');
  
  // Colors
  if (styles.colors) {
    css.push('  /* Colors */');
    const colorMap = {
      'backgroundColor': '--theme-bg-color',
      'textColor': '--theme-text-color',
      'borderColor': '--theme-border-color',
      'hoverBackgroundColor': '--theme-hover-bg-color',
      'accentColor': '--theme-accent-color',
      'headingColor': '--theme-heading-color',
      'subtextColor': '--theme-subtext-color',
      'mutedTextColor': '--theme-muted-text-color',
      'dividerColor': '--theme-divider-color',
    };
    
    Object.entries(colorMap).forEach(([key, cssVar]) => {
      if (styles.colors[key]) {
        css.push(`  ${cssVar}: ${styles.colors[key]};`);
      }
    });
    css.push('');
  }
  
  // Typography
  if (styles.typography) {
    css.push('  /* Typography */');
    const typographyMap = {
      'fontFamily': '--theme-font-family',
      'fontSize': '--theme-font-size',
      'headingFontSize': '--theme-heading-font-size',
      'smallFontSize': '--theme-small-font-size',
      'fontWeight': '--theme-font-weight',
      'headingFontWeight': '--theme-heading-font-weight',
      'boldFontWeight': '--theme-bold-font-weight',
      'lineHeight': '--theme-line-height',
    };
    
    Object.entries(typographyMap).forEach(([key, cssVar]) => {
      if (styles.typography[key]) {
        css.push(`  ${cssVar}: ${styles.typography[key]};`);
      }
    });
    css.push('');
  }
  
  // Layout
  if (styles.layout) {
    css.push('  /* Layout */');
    const layoutMap = {
      'padding': '--theme-padding',
      'margin': '--theme-margin',
      'borderRadius': '--theme-border-radius',
      'borderWidth': '--theme-border-width',
      'boxShadow': '--theme-box-shadow',
    };
    
    Object.entries(layoutMap).forEach(([key, cssVar]) => {
      if (styles.layout[key]) {
        css.push(`  ${cssVar}: ${styles.layout[key]};`);
      }
    });
    css.push('');
  }
  
  // Animations
  if (styles.animations) {
    css.push('  /* Animations */');
    const animationsMap = {
      'transitionDuration': '--theme-transition-duration',
      'hoverTransition': '--theme-hover-transition',
    };
    
    Object.entries(animationsMap).forEach(([key, cssVar]) => {
      if (styles.animations[key]) {
        css.push(`  ${cssVar}: ${styles.animations[key]};`);
      }
    });
    css.push('');
  }
  
  css.push('}');
  css.push('');
  
  // 共通CSSルール
  css.push('/* メモコンテナ */');
  css.push('.memo-container {');
  css.push('  background-color: var(--theme-bg-color);');
  css.push('  color: var(--theme-text-color);');
  css.push('  border: var(--theme-border-width) solid var(--theme-border-color);');
  css.push('  border-radius: var(--theme-border-radius);');
  css.push('  padding: var(--theme-padding);');
  css.push('  margin: var(--theme-margin);');
  css.push('  box-shadow: var(--theme-box-shadow);');
  css.push('  font-family: var(--theme-font-family);');
  css.push('  font-size: var(--theme-font-size);');
  css.push('  line-height: var(--theme-line-height);');
  if (styles.animations?.transitionDuration !== '0ms') {
    css.push('  transition: background-color var(--theme-transition-duration);');
  }
  css.push('}');
  css.push('');
  
  css.push('.memo-container:hover {');
  css.push('  background-color: var(--theme-hover-bg-color);');
  css.push('}');
  css.push('');
  
  // 残りの共通ルール
  css.push('/* 見出し */');
  css.push('.memo-title, h1, h2, h3, h4, h5, h6 {');
  css.push('  color: var(--theme-heading-color);');
  css.push('  font-size: var(--theme-heading-font-size);');
  css.push('  font-weight: var(--theme-heading-font-weight);');
  css.push('  font-family: var(--theme-font-family);');
  css.push('}');
  css.push('');
  
  css.push('/* アクセント要素 */');
  css.push('.memo-accent, .button-primary, .link-primary {');
  css.push('  color: var(--theme-accent-color);');
  css.push('  border-color: var(--theme-accent-color);');
  css.push('}');
  css.push('');
  
  css.push('/* サブテキスト */');
  css.push('.memo-subtext, .text-secondary {');
  css.push('  color: var(--theme-subtext-color);');
  css.push('  font-size: var(--theme-small-font-size);');
  css.push('}');
  css.push('');
  
  css.push('/* ミュートテキスト */');
  css.push('.memo-muted, .text-muted {');
  css.push('  color: var(--theme-muted-text-color);');
  css.push('}');
  css.push('');
  
  css.push('/* 区切り線 */');
  css.push('.memo-divider, .divider, hr {');
  css.push('  border-color: var(--theme-divider-color);');
  css.push('}');
  
  return css.join('\n');
}

function main() {
  console.log('🎨 不足しているCSSファイルを生成中...');
  
  const cssDir = join(__dirname, '..', 'src', 'themes', 'css');
  let generatedCount = 0;
  let skippedCount = 0;
  
  // theme-presetsからCSSファイル名をマッピング
  const presetNameToId = new Map<string, string>();
  themeDefinitions.forEach(def => {
    const matchingPreset = themePresets.find(preset => preset.name === def.name);
    if (matchingPreset) {
      presetNameToId.set(matchingPreset.name, def.id);
    }
  });
  
  for (const preset of themePresets) {
    const themeId = presetNameToId.get(preset.name);
    if (!themeId) {
      console.log(`⚠️  テーマ定義が見つかりません: ${preset.name}`);
      continue;
    }
    
    const cssFileName = `${themeId}.css`;
    const cssFilePath = join(cssDir, cssFileName);
    
    if (existsSync(cssFilePath)) {
      console.log(`⏭️  既存ファイルをスキップ: ${cssFileName}`);
      skippedCount++;
      continue;
    }
    
    const cssContent = convertStylesDataToCSS(themeId, preset.name, preset.description, preset.styles as StyleData);
    
    writeFileSync(cssFilePath, cssContent, 'utf8');
    console.log(`✅ 生成完了: ${cssFileName} (${cssContent.length} chars)`);
    generatedCount++;
  }
  
  console.log('');
  console.log(`🎉 CSSファイル生成完了!`);
  console.log(`  生成: ${generatedCount}個`);
  console.log(`  スキップ: ${skippedCount}個`);
  console.log('');
  console.log('次のステップ:');
  console.log('  npm run generate:css-theme-migration  # CSS参照型migrationを生成');
}

if (require.main === module) {
  main();
}