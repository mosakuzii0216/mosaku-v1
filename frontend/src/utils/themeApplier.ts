/**
 * CSS参照型テーマの適用ユーティリティ
 */

import { logger } from './logger';
import type { Theme } from '../types/theme';

interface AppliedTheme {
	id: string;
	styleElement: HTMLStyleElement;
}

class ThemeApplier {
	private currentTheme: AppliedTheme | null = null;
	private readonly styleId = 'dynamic-theme-styles';

	/**
	 * テーマCSSを動的に適用
	 */
	public applyTheme(themeId: string, cssContent: string): void {
		// 既存のテーマスタイルを削除
		this.removeCurrentTheme();

		// 新しいスタイル要素を作成
		const styleElement = document.createElement('style');
		styleElement.id = this.styleId;
		styleElement.setAttribute('data-theme-id', themeId);
		styleElement.textContent = cssContent;

		// headに追加
		document.head.appendChild(styleElement);

		// 現在のテーマ情報を保存
		this.currentTheme = {
			id: themeId,
			styleElement,
		};

		logger.debug(`✅ テーマ「${themeId}」を適用しました`);
	}

	/**
	 * 現在適用されているテーマを削除
	 */
	public removeCurrentTheme(): void {
		if (this.currentTheme) {
			this.currentTheme.styleElement.remove();
			logger.debug(`🗑️ テーマ「${this.currentTheme.id}」を削除しました`);
			this.currentTheme = null;
		}

		// 念のため、IDで検索して削除
		const existingStyle = document.getElementById(this.styleId);
		if (existingStyle) {
			existingStyle.remove();
		}
	}

	/**
	 * 現在適用されているテーマID
	 */
	public getCurrentThemeId(): string | null {
		return this.currentTheme?.id || null;
	}

	/**
	 * テーマが適用されているかチェック
	 */
	public isThemeApplied(themeId: string): boolean {
		return this.currentTheme?.id === themeId;
	}
}

// シングルトンインスタンス
export const themeApplier = new ThemeApplier();

/**
 * テーマオブジェクトからCSSを適用
 */
export function applyThemeFromObject(theme: Theme): void {
	if (!theme) {
		logger.warn('⚠️ テーマが指定されていません');
		return;
	}

	// CSS参照型の場合
	if (theme.styles?.type === 'css-based' && theme.styles?.cssContent) {
		themeApplier.applyTheme(theme.id, theme.styles.cssContent);
		return;
	}

	// 既存のオブジェクト形式の場合（CSS変数に変換）
	if (theme.styles?.colors && theme.styles?.typography && theme.styles?.layout) {
		const cssContent = convertObjectToCSSVariables(theme);
		themeApplier.applyTheme(theme.id, cssContent);
		return;
	}

	logger.warn('⚠️ 未知のテーマ形式です:', theme);
}

/**
 * オブジェクト形式のテーマをCSS変数に変換
 */
function convertObjectToCSSVariables(theme: Theme): string {
	const css = [];

	css.push(`/* ${theme.name} - 動的生成 */`);
	css.push('');
	css.push(':root {');

	const styles = theme.styles;

	// Colors
	if (styles?.colors) {
		css.push('  /* Colors */');
		const colorMap = {
			backgroundColor: '--theme-bg-color',
			textColor: '--theme-text-color',
			borderColor: '--theme-border-color',
			hoverBackgroundColor: '--theme-hover-bg-color',
			accentColor: '--theme-accent-color',
			headingColor: '--theme-heading-color',
			subtextColor: '--theme-subtext-color',
			mutedTextColor: '--theme-muted-text-color',
			dividerColor: '--theme-divider-color',
		};
		const colors = styles.colors as unknown as Record<string, string | undefined>;
		Object.entries(colorMap).forEach(([key, cssVar]) => {
			if (colors[key]) {
				css.push(`  ${cssVar}: ${colors[key]};`);
			}
		});
		css.push('');
	}

	// Typography
	if (styles?.typography) {
		css.push('  /* Typography */');
		const typographyMap = {
			fontFamily: '--theme-font-family',
			fontSize: '--theme-font-size',
			headingFontSize: '--theme-heading-font-size',
			smallFontSize: '--theme-small-font-size',
			fontWeight: '--theme-font-weight',
			headingFontWeight: '--theme-heading-font-weight',
			boldFontWeight: '--theme-bold-font-weight',
			lineHeight: '--theme-line-height',
		};
		const typography = styles.typography as unknown as Record<string, string | undefined>;
		Object.entries(typographyMap).forEach(([key, cssVar]) => {
			if (typography[key]) {
				css.push(`  ${cssVar}: ${typography[key]};`);
			}
		});
		css.push('');
	}

	// Layout
	if (styles?.layout) {
		css.push('  /* Layout */');
		const layoutMap = {
			padding: '--theme-padding',
			margin: '--theme-margin',
			borderRadius: '--theme-border-radius',
			borderWidth: '--theme-border-width',
			boxShadow: '--theme-box-shadow',
		};
		const layout = styles.layout as unknown as Record<string, string | undefined>;
		Object.entries(layoutMap).forEach(([key, cssVar]) => {
			if (layout[key]) {
				css.push(`  ${cssVar}: ${layout[key]};`);
			}
		});
		css.push('');
	}

	// Animations
	if (styles?.animations) {
		css.push('  /* Animations */');
		const animationsMap = {
			transitionDuration: '--theme-transition-duration',
			hoverTransition: '--theme-hover-transition',
		};
		const animations = styles.animations as unknown as Record<string, string | undefined>;
		Object.entries(animationsMap).forEach(([key, cssVar]) => {
			if (animations[key]) {
				css.push(`  ${cssVar}: ${animations[key]};`);
			}
		});
		css.push('');
	}

	css.push('}');

	return css.join('\n');
}
