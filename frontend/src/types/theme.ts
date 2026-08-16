const VALID_EFFECT_KEYS = new Set<string>(['mori', 'umi', 'yoru', 'asa']);

export type ThemeEffectKey = 'mori' | 'umi' | 'yoru' | 'asa';

export interface ThemeMetadata {
	effectKey?: ThemeEffectKey;
	previewColor?: string;
	[key: string]: unknown;
}

export function getEffectKey(
	theme: { metadata?: ThemeMetadata } | null | undefined,
): ThemeEffectKey | undefined {
	const raw = theme?.metadata?.effectKey;
	if (typeof raw === 'string' && VALID_EFFECT_KEYS.has(raw)) {
		return raw as ThemeEffectKey;
	}
	return undefined;
}

export interface ThemeColors {
	backgroundColor: string;
	textColor: string;
	borderColor: string;
	hoverBackgroundColor: string;
	accentColor: string;
	headingColor: string;
	subtextColor: string;
	mutedTextColor: string;
	dividerColor?: string;
	successColor?: string;
	warningColor?: string;
	errorColor?: string;
	cardShadowColor?: string;
}

export interface ThemeTypography {
	fontFamily: string;
	fontSize: string;
	fontWeight: string;
	lineHeight: string;
	headingFontFamily?: string;
	headingFontSize?: string;
	headingFontWeight?: string;
	smallFontSize?: string;
	boldFontWeight?: string;
	letterSpacing?: string;
	textAlign?: 'left' | 'center' | 'right' | 'justify';
}

export interface ThemeLayout {
	padding: string;
	margin: string;
	borderRadius: string;
	borderWidth?: string;
	boxShadow?: string;
	maxWidth?: string;
	minHeight?: string;
}

export interface ThemeAccessibility {
	highContrast?: boolean;
	reducedMotion?: boolean;
	fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
}

export interface ThemeAnimations {
	transitionDuration?: string;
	hoverTransition?: string;
	fadeInDuration?: string;
}

export interface ThemeStyles {
	colors?: ThemeColors;
	typography?: ThemeTypography;
	layout?: ThemeLayout;
	accessibility?: ThemeAccessibility;
	animations?: ThemeAnimations;
	customProperties?: Record<string, string>;
	version: string;

	// CSS参照型テーマの場合
	type?: 'css-based' | 'object-based';
	cssContent?: string;
}

export interface Theme {
	id: string;
	name: string;
	description: string | null;
	isSystem: boolean;
	isPublic: boolean;
	cssFilePath: string; // CSSファイルのパス
	metadata?: ThemeMetadata;
	styles?: ThemeStyles; // 後方互換性のため残す
	createdAt: string;
	updatedAt: string;
	createdById: string | null;
	createdBy?: {
		id: string;
		name: string | null;
	} | null;
	isFavorited?: boolean;
	favoriteCount: number;
	usageCount: number;
}

export type ThemeCategory =
	| 'basic'
	| 'business'
	| 'creative'
	| 'study'
	| 'seasonal'
	| 'accessibility';

export interface ThemeSearchParams {
	query?: string;
	category?: ThemeCategory;
	isSystem?: boolean;
	isPublic?: boolean;
	favoritesOnly?: boolean;
}

export interface CreateThemeData {
	name: string;
	description?: string;
	isPublic?: boolean;
	styles: ThemeStyles;
}

export interface UpdateThemeData {
	name?: string;
	description?: string;
	isPublic?: boolean;
	styles?: ThemeStyles;
}
