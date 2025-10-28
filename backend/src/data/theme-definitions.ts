/**
 * CSS参照型テーマ定義
 * スタイルはCSSファイルで管理し、ここではメタデータのみ定義
 */

export interface ThemeDefinition {
	id: string;
	name: string;
	description: string;
	category: 'basic' | 'business' | 'study' | 'creative' | 'seasonal' | 'accessibility';
	isSystem: boolean;
	isPublic: boolean;
	cssFile: string; // CSSファイルのパス
	version: string;
	author?: string;
	accessibility?: {
		highContrast?: boolean;
		reducedMotion?: boolean;
		fontSize?: 'small' | 'medium' | 'large';
	};
}

/**
 * テーマ定義リスト
 * CSSファイルと連動したテーマメタデータ
 */
export const themeDefinitions: ThemeDefinition[] = [
	// ========== 基本系 ==========
	{
		id: 'clean-white',
		name: 'クリーンホワイト',
		description: '汎用的でシンプルな白ベースのテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFile: 'clean-white.css',
		version: '1.0',
	},

	{
		id: 'soft-gray',
		name: 'ソフトグレー',
		description: '目に優しいグレーベースのテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFile: 'soft-gray.css',
		version: '1.0',
	},

	{
		id: 'dark-mode',
		name: 'ダークモード',
		description: '夜間作業に適したダークテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFile: 'dark-mode.css',
		version: '1.0',
	},

	// ========== ビジネス系 ==========
	{
		id: 'professional',
		name: 'プロフェッショナル',
		description: 'ビジネス文書に適した洗練されたテーマ',
		category: 'business',
		isSystem: true,
		isPublic: true,
		cssFile: 'professional.css',
		version: '1.0',
	},

	{
		id: 'executive',
		name: 'エグゼクティブ',
		description: '重要な文書に適した格調高いテーマ',
		category: 'business',
		isSystem: true,
		isPublic: true,
		cssFile: 'executive.css',
		version: '1.0',
	},

	// ========== 学習系 ==========
	{
		id: 'study-blue',
		name: 'スタディブルー',
		description: '集中力を高める青ベースの学習テーマ',
		category: 'study',
		isSystem: true,
		isPublic: true,
		cssFile: 'study-blue.css',
		version: '1.0',
	},

	{
		id: 'academic',
		name: 'アカデミック',
		description: '研究・論文執筆に適したアカデミックテーマ',
		category: 'study',
		isSystem: true,
		isPublic: true,
		cssFile: 'academic.css',
		version: '1.0',
	},

	// ========== クリエイティブ系 ==========
	{
		id: 'artist',
		name: 'アーティスト',
		description: 'クリエイティブな発想を促す紫ベースのテーマ',
		category: 'creative',
		isSystem: true,
		isPublic: true,
		cssFile: 'artist.css',
		version: '1.0',
	},

	{
		id: 'vintage',
		name: 'ヴィンテージ',
		description: 'レトロで温かみのあるヴィンテージテーマ',
		category: 'creative',
		isSystem: true,
		isPublic: true,
		cssFile: 'vintage.css',
		version: '1.0',
	},

	// ========== 季節系 ==========
	{
		id: 'sakura-pink',
		name: 'サクラピンク',
		description: '春の桜をイメージした優雅なピンクテーマ',
		category: 'seasonal',
		isSystem: true,
		isPublic: true,
		cssFile: 'sakura-pink.css',
		version: '1.0',
	},

	{
		id: 'ocean-blue',
		name: 'オーシャンブルー',
		description: '夏の海をイメージした爽やかなブルーテーマ',
		category: 'seasonal',
		isSystem: true,
		isPublic: true,
		cssFile: 'ocean-blue.css',
		version: '1.0',
	},

	{
		id: 'natural-green',
		name: 'ナチュラルグリーン',
		description: '自然をイメージした癒しの緑テーマ',
		category: 'seasonal',
		isSystem: true,
		isPublic: true,
		cssFile: 'natural-green.css',
		version: '1.0',
	},

	// ========== アクセシビリティ系 ==========
	{
		id: 'high-contrast',
		name: 'ハイコントラスト',
		description: '視覚的な識別性を重視したハイコントラストテーマ',
		category: 'accessibility',
		isSystem: true,
		isPublic: true,
		cssFile: 'high-contrast.css',
		version: '1.0',
		accessibility: {
			highContrast: true,
			reducedMotion: true,
			fontSize: 'large',
		},
	},

	{
		id: 'sepia-eye-care',
		name: 'セピア護眼',
		description: '目の疲れを軽減するセピア調テーマ',
		category: 'accessibility',
		isSystem: true,
		isPublic: true,
		cssFile: 'sepia-eye-care.css',
		version: '1.0',
		accessibility: {
			reducedMotion: true,
			fontSize: 'medium',
		},
	},

	{
		id: 'warm-beige',
		name: 'ウォームベージュ',
		description: 'カフェのような温かみのあるベージュテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFile: 'warm-beige.css',
		version: '1.0',
	},
];
