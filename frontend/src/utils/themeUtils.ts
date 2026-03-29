import type {
	Theme,
	ThemeStyles,
	ThemeCSSVariables,
	ThemeColors,
	ThemeTypography,
	ThemeLayout,
} from '../types/theme';

/**
 * テーマスタイルをCSS変数に変換する（後方互換性のため）
 */
export const convertThemeToCSS = (theme: Theme): ThemeCSSVariables => {
	const { styles } = theme;

	if (!styles) {
		return {} as ThemeCSSVariables;
	}

	const cssVariables: Partial<ThemeCSSVariables> = {
		// 基本色
		'--theme-bg-color': styles.colors?.backgroundColor,
		'--theme-text-color': styles.colors?.textColor,
		'--theme-border-color': styles.colors?.borderColor,
		'--theme-accent-color': styles.colors?.accentColor,
		'--theme-hover-bg-color': styles.colors?.hoverBackgroundColor,

		// テキスト階層色
		'--theme-heading-color': styles.colors?.headingColor,
		'--theme-subtext-color': styles.colors?.subtextColor,
		'--theme-muted-text-color': styles.colors?.mutedTextColor,

		// タイポグラフィ
		'--theme-font-family': styles.typography?.fontFamily,
		'--theme-font-size': styles.typography?.fontSize,
		'--theme-font-weight': styles.typography?.fontWeight,
		'--theme-line-height': styles.typography?.lineHeight,

		// レイアウト
		'--theme-padding': styles.layout?.padding,
		'--theme-margin': styles.layout?.margin,
		'--theme-border-radius': styles.layout?.borderRadius,

		// オプショナルな色
		...(styles.colors?.dividerColor && { '--theme-divider-color': styles.colors.dividerColor }),
		...(styles.colors?.successColor && { '--theme-success-color': styles.colors.successColor }),
		...(styles.colors?.warningColor && { '--theme-warning-color': styles.colors.warningColor }),
		...(styles.colors?.errorColor && { '--theme-error-color': styles.colors.errorColor }),

		// オプショナルなタイポグラフィ
		...(styles.typography?.headingFontFamily && {
			'--theme-heading-font-family': styles.typography.headingFontFamily,
		}),
		...(styles.typography?.headingFontSize && {
			'--theme-heading-font-size': styles.typography.headingFontSize,
		}),
		...(styles.typography?.headingFontWeight && {
			'--theme-heading-font-weight': styles.typography.headingFontWeight,
		}),
		...(styles.typography?.smallFontSize && {
			'--theme-small-font-size': styles.typography.smallFontSize,
		}),

		// オプショナルなレイアウト
		...(styles.layout?.borderWidth && { '--theme-border-width': styles.layout.borderWidth }),
		...(styles.layout?.boxShadow && { '--theme-box-shadow': styles.layout.boxShadow }),
		...(styles.layout?.maxWidth && { '--theme-max-width': styles.layout.maxWidth }),

		// アニメーション
		...(styles.animations?.transitionDuration && {
			'--theme-transition-duration': styles.animations.transitionDuration,
		}),
		...(styles.animations?.hoverTransition && {
			'--theme-hover-transition': styles.animations.hoverTransition,
		}),

		// カスタムプロパティ
		...(styles.customProperties && styles.customProperties),
	};

	// undefinedのプロパティをフィルタリング
	return Object.fromEntries(
		Object.entries(cssVariables).filter(([, value]) => value !== undefined && value !== null),
	) as ThemeCSSVariables;
};

/**
 * テーマをDOM要素に適用する
 */
export const applyThemeToElement = async (element: HTMLElement, theme: Theme): Promise<void> => {
	// stylesオブジェクトベースのテーマの場合
	if (theme.styles) {
		const cssVariables = convertThemeToCSS(theme);

		Object.entries(cssVariables).forEach(([property, value]) => {
			element.style.setProperty(property, value);
		});
	}
};

/**
 * テーマをルート要素に適用する
 */
export const applyThemeToRoot = async (theme: Theme): Promise<void> => {
	const root = document.documentElement;
	await applyThemeToElement(root, theme);
};

/**
 * 特定の要素からテーマを削除する
 */
export const removeThemeFromElement = (element: HTMLElement): void => {
	// CSS変数のプロパティ名リスト
	const themeProperties = [
		'--theme-bg-color',
		'--theme-text-color',
		'--theme-border-color',
		'--theme-accent-color',
		'--theme-hover-bg-color',
		'--theme-heading-color',
		'--theme-subtext-color',
		'--theme-muted-text-color',
		'--theme-font-family',
		'--theme-font-size',
		'--theme-font-weight',
		'--theme-line-height',
		'--theme-padding',
		'--theme-margin',
		'--theme-border-radius',
		'--theme-divider-color',
		'--theme-success-color',
		'--theme-warning-color',
		'--theme-error-color',
		'--theme-heading-font-family',
		'--theme-heading-font-size',
		'--theme-heading-font-weight',
		'--theme-small-font-size',
		'--theme-border-width',
		'--theme-box-shadow',
		'--theme-max-width',
		'--theme-transition-duration',
		'--theme-hover-transition',
	];

	themeProperties.forEach((property) => {
		element.style.removeProperty(property);
	});
};

/**
 * テーマが適用可能かチェックする
 */
export const isValidTheme = (theme: unknown): theme is Theme => {
	return (
		theme &&
		typeof theme === 'object' &&
		theme.id &&
		theme.styles?.colors?.backgroundColor &&
		theme.styles?.colors?.textColor &&
		theme.styles?.typography?.fontFamily &&
		theme.styles?.typography?.fontSize
	);
};

/**
 * テーマスタイルの一部を上書きする
 */
export const mergeThemeStyles = (baseTheme: Theme, overrides: Partial<ThemeStyles>): Theme => {
	const baseStyles = baseTheme.styles;

	// 各セクションのデフォルト値を定義（必須プロパティを網羅）
	const defaultColors: ThemeColors = {
		backgroundColor: '#ffffff',
		textColor: '#000000',
		borderColor: '#cccccc',
		hoverBackgroundColor: '#f0f0f0',
		accentColor: '#007bff',
		headingColor: '#000000',
		subtextColor: '#555555',
		mutedTextColor: '#888888',
	};
	const defaultTypography: ThemeTypography = {
		fontFamily: 'sans-serif',
		fontSize: '16px',
		fontWeight: '400',
		lineHeight: '1.5',
	};
	const defaultLayout: ThemeLayout = {
		padding: '1rem',
		margin: '1rem',
		borderRadius: '0.25rem',
	};

	const mergedStyles: ThemeStyles = {
		version: overrides.version || baseStyles?.version || '1.0.0',
		type: overrides.type || baseStyles?.type,
		cssContent: overrides.cssContent || baseStyles?.cssContent,
		colors: {
			...defaultColors,
			...baseStyles?.colors,
			...overrides.colors,
		},
		typography: {
			...defaultTypography,
			...baseStyles?.typography,
			...overrides.typography,
		},
		layout: {
			...defaultLayout,
			...baseStyles?.layout,
			...overrides.layout,
		},
		accessibility: {
			...baseStyles?.accessibility,
			...overrides.accessibility,
		},
		animations: {
			...baseStyles?.animations,
			...overrides.animations,
		},
		customProperties: {
			...baseStyles?.customProperties,
			...overrides.customProperties,
		},
	};

	return { ...baseTheme, styles: mergedStyles };
};

/**
 * テーマのコントラスト比を計算する（アクセシビリティ用）
 */
export const calculateContrastRatio = (color1: string, color2: string): number => {
	// 簡易的なコントラスト比計算
	// 実際のプロダクションでは、より正確なライブラリを使用することを推奨
	const getLuminance = (color: string): number => {
		// 16進数カラーコードから輝度を計算
		const hex = color.replace('#', '');
		const r = parseInt(hex.substr(0, 2), 16) / 255;
		const g = parseInt(hex.substr(2, 2), 16) / 255;
		const b = parseInt(hex.substr(4, 2), 16) / 255;

		const sRGB = [r, g, b].map((c) => {
			if (c <= 0.03928) {
				return c / 12.92;
			} else {
				return Math.pow((c + 0.055) / 1.055, 2.4);
			}
		});

		return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
	};

	const l1 = getLuminance(color1);
	const l2 = getLuminance(color2);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);

	return (lighter + 0.05) / (darker + 0.05);
};

/**
 * テーマがアクセシブルかチェックする
 */
export const isAccessibleTheme = (theme: Theme): boolean => {
	const colors = theme.styles?.colors;
	if (!colors?.backgroundColor || !colors.textColor) {
		return false; // 色が定義されていなければアクセシブルではないと判断
	}

	// 背景色とテキスト色のコントラスト比をチェック
	const contrastRatio = calculateContrastRatio(colors.backgroundColor, colors.textColor);

	// WCAG AAレベル（4.5:1以上）を満たしているかチェック
	return contrastRatio >= 4.5;
};

/**
 * ダークテーマかどうかを判定する
 */
export const isDarkTheme = (theme: Theme): boolean => {
	const bgColor = theme.styles?.colors?.backgroundColor;
	if (!bgColor) {
		return false; // 色がなければダークテーマではないと判断
	}

	// 背景色の明度を計算して、50%未満ならダークテーマと判定
	const hex = bgColor.replace('#', '');
	const r = parseInt(hex.substr(0, 2), 16);
	const g = parseInt(hex.substr(2, 2), 16);
	const b = parseInt(hex.substr(4, 2), 16);

	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness < 128;
};
