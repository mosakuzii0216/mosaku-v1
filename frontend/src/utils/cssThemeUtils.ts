/**
 * CSS参照型テーマのユーティリティ関数
 */

export interface ParsedCSSVariables {
	backgroundColor?: string;
	textColor?: string;
	borderColor?: string;
	hoverBackgroundColor?: string;
	accentColor?: string;
	headingColor?: string;
	subtextColor?: string;
	mutedTextColor?: string;
	dividerColor?: string;
	fontFamily?: string;
	fontSize?: string;
	headingFontSize?: string;
	smallFontSize?: string;
	fontWeight?: string;
	headingFontWeight?: string;
	lineHeight?: string;
	padding?: string;
	margin?: string;
	borderRadius?: string;
	borderWidth?: string;
	boxShadow?: string;
	transitionDuration?: string;
	hoverTransition?: string;
}

/**
 * CSS内容からCSS変数を抽出して解析
 */
export function parseCSSVariables(cssContent: string): ParsedCSSVariables {
	const variables: ParsedCSSVariables = {};

	// CSS変数の正規表現 --variable-name: value;
	const cssVarRegex = /--([a-zA-Z-]+):\s*([^;]+);/g;
	let match;

	// テーマ変数マッピング
	const variableMap: Record<string, keyof ParsedCSSVariables> = {
		'theme-bg-color': 'backgroundColor',
		'theme-text-color': 'textColor',
		'theme-border-color': 'borderColor',
		'theme-hover-bg-color': 'hoverBackgroundColor',
		'theme-accent-color': 'accentColor',
		'theme-heading-color': 'headingColor',
		'theme-subtext-color': 'subtextColor',
		'theme-muted-text-color': 'mutedTextColor',
		'theme-divider-color': 'dividerColor',
		'theme-font-family': 'fontFamily',
		'theme-font-size': 'fontSize',
		'theme-heading-font-size': 'headingFontSize',
		'theme-small-font-size': 'smallFontSize',
		'theme-font-weight': 'fontWeight',
		'theme-heading-font-weight': 'headingFontWeight',
		'theme-line-height': 'lineHeight',
		'theme-padding': 'padding',
		'theme-margin': 'margin',
		'theme-border-radius': 'borderRadius',
		'theme-border-width': 'borderWidth',
		'theme-box-shadow': 'boxShadow',
		'theme-transition-duration': 'transitionDuration',
		'theme-hover-transition': 'hoverTransition',
	};

	while ((match = cssVarRegex.exec(cssContent)) !== null) {
		const [, varName, value] = match;
		const mappedKey = variableMap[varName];

		if (mappedKey) {
			variables[mappedKey] = value.trim();
		}
	}

	return variables;
}

/**
 * デフォルトのテーマ変数を取得
 */
function getDefaultVariables(): ParsedCSSVariables {
	return {
		backgroundColor: '#FFFFFF',
		textColor: '#1F2937',
		borderColor: '#E5E7EB',
		hoverBackgroundColor: '#F3F4F6',
		accentColor: '#3B82F6',
		headingColor: '#111827',
		subtextColor: '#6B7280',
		mutedTextColor: '#9CA3AF',
		dividerColor: '#E5E7EB',
		fontFamily: '"Inter", system-ui, sans-serif',
		fontSize: '1rem',
		headingFontSize: '1.5rem',
		smallFontSize: '0.875rem',
		fontWeight: '400',
		headingFontWeight: '600',
		lineHeight: '1.5',
		padding: '1rem',
		margin: '0.5rem',
		borderRadius: '0.5rem',
		borderWidth: '1px',
		boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
		transitionDuration: '200ms',
		hoverTransition: 'all 200ms ease',
	};
}

/**
 * テーマからCSS変数を取得（既存形式とCSS参照型の両方に対応）
 */
export function getThemeVariables(theme: any): ParsedCSSVariables {
	// CSSファイルベースの場合（新形式）
	if (theme.cssFilePath && !theme.styles) {
		// CSSファイルベースのテーマの場合は、フォールバック値を返す
		// 実際のテーマ色はCSSファイルで管理されているため
		return getDefaultVariables();
	}

	// CSS参照型の場合（旧形式）
	if (theme.styles?.type === 'css-based' && theme.styles?.cssContent) {
		return parseCSSVariables(theme.styles.cssContent);
	}

	// 既存のオブジェクト型の場合
	if (theme.styles?.colors && theme.styles?.typography && theme.styles?.layout) {
		return {
			backgroundColor: theme.styles.colors.backgroundColor,
			textColor: theme.styles.colors.textColor,
			borderColor: theme.styles.colors.borderColor,
			hoverBackgroundColor: theme.styles.colors.hoverBackgroundColor,
			accentColor: theme.styles.colors.accentColor,
			headingColor: theme.styles.colors.headingColor,
			subtextColor: theme.styles.colors.subtextColor,
			mutedTextColor: theme.styles.colors.mutedTextColor,
			dividerColor: theme.styles.colors.dividerColor,
			fontFamily: theme.styles.typography.fontFamily,
			fontSize: theme.styles.typography.fontSize,
			headingFontSize: theme.styles.typography.headingFontSize,
			smallFontSize: theme.styles.typography.smallFontSize,
			fontWeight: theme.styles.typography.fontWeight,
			headingFontWeight: theme.styles.typography.headingFontWeight,
			lineHeight: theme.styles.typography.lineHeight,
			padding: theme.styles.layout.padding,
			margin: theme.styles.layout.margin,
			borderRadius: theme.styles.layout.borderRadius,
			borderWidth: theme.styles.layout.borderWidth,
			boxShadow: theme.styles.layout.boxShadow,
			transitionDuration: theme.styles.animations?.transitionDuration,
			hoverTransition: theme.styles.animations?.hoverTransition,
		};
	}

	// フォールバック値
	return {
		backgroundColor: '#FFFFFF',
		textColor: '#1F2937',
		borderColor: '#E5E7EB',
		hoverBackgroundColor: '#F9FAFB',
		accentColor: '#3B82F6',
		headingColor: '#111827',
		subtextColor: '#6B7280',
		mutedTextColor: '#9CA3AF',
		dividerColor: '#F3F4F6',
		fontFamily: '"Inter", system-ui, sans-serif',
		fontSize: '1rem',
		headingFontSize: '1.5rem',
		smallFontSize: '0.875rem',
		fontWeight: '400',
		headingFontWeight: '600',
		lineHeight: '1.6',
		padding: '1rem',
		margin: '0.5rem',
		borderRadius: '0.5rem',
		borderWidth: '1px',
		boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
		transitionDuration: '200ms',
	};
}
