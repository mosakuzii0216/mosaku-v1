/**
 * CSSファイル参照型テーマ定義
 * データベースにはCSSファイルパスとメタデータのみ保存
 */

export interface CSSFileThemeDefinition {
	id: string;
	name: string;
	description: string;
	category: 'basic' | 'business' | 'study' | 'creative' | 'seasonal' | 'accessibility';
	isSystem: boolean;
	isPublic: boolean;
	cssFilePath: string; // public/themes/ からの相対パス
	metadata: {
		version: string;
		author?: string;
		accessibility?: {
			highContrast?: boolean;
			reducedMotion?: boolean;
			fontSize?: 'small' | 'medium' | 'large';
		};
	};
}

/**
 * CSSファイル参照型テーマ定義リスト
 */
export const cssFileThemeDefinitions: CSSFileThemeDefinition[] = [
	// ========== 基本系 ==========
	{
		id: 'clean-white',
		name: 'クリーンホワイト',
		description: '汎用的でシンプルな白ベースのテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'clean-white.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'soft-gray',
		name: 'ソフトグレー',
		description: '目に優しいグレーベースのテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'soft-gray.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'dark-mode',
		name: 'ダークモード',
		description: '夜間作業に適したダークテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'dark-mode.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'natural-green',
		name: 'ナチュラルグリーン',
		description: '自然をイメージした癒しの緑テーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'natural-green.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'warm-beige',
		name: 'ウォームベージュ',
		description: 'カフェのような温かみのあるベージュテーマ',
		category: 'basic',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'warm-beige.css',
		metadata: {
			version: '1.0',
		},
	},

	// ========== ビジネス系 ==========
	{
		id: 'professional',
		name: 'プロフェッショナル',
		description: 'ビジネス文書に適した洗練されたテーマ',
		category: 'business',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'professional.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'executive',
		name: 'エグゼクティブ',
		description: '重要な文書に適した格調高いテーマ',
		category: 'business',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'executive.css',
		metadata: {
			version: '1.0',
		},
	},

	// ========== 学習系 ==========
	{
		id: 'study-blue',
		name: 'スタディブルー',
		description: '集中力を高める青ベースの学習テーマ',
		category: 'study',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'study-blue.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'academic',
		name: 'アカデミック',
		description: '研究・論文執筆に適したアカデミックテーマ',
		category: 'study',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'academic.css',
		metadata: {
			version: '1.0',
		},
	},

	// ========== クリエイティブ系 ==========
	{
		id: 'artist',
		name: 'アーティスト',
		description: 'クリエイティブな発想を促す紫ベースのテーマ',
		category: 'creative',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'artist.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'vintage',
		name: 'ヴィンテージ',
		description: 'レトロで温かみのあるヴィンテージテーマ',
		category: 'creative',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'vintage.css',
		metadata: {
			version: '1.0',
		},
	},

	// ========== 季節系 ==========
	{
		id: 'sakura-pink',
		name: 'サクラピンク',
		description: '春の桜をイメージした優雅なピンクテーマ',
		category: 'seasonal',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'sakura-pink.css',
		metadata: {
			version: '1.0',
		},
	},

	{
		id: 'ocean-blue',
		name: 'オーシャンブルー',
		description: '夏の海をイメージした爽やかなブルーテーマ',
		category: 'seasonal',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'ocean-blue.css',
		metadata: {
			version: '1.0',
		},
	},

	// ========== アクセシビリティ系 ==========
	{
		id: 'high-contrast',
		name: 'ハイコントラスト',
		description: '視覚的な識別性を重視したハイコントラストテーマ',
		category: 'accessibility',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'high-contrast.css',
		metadata: {
			version: '1.0',
			accessibility: {
				highContrast: true,
				reducedMotion: true,
				fontSize: 'large',
			},
		},
	},

	{
		id: 'sepia-eye-care',
		name: 'セピア護眼',
		description: '目の疲れを軽減するセピア調テーマ',
		category: 'accessibility',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'sepia-eye-care.css',
		metadata: {
			version: '1.0',
			accessibility: {
				reducedMotion: true,
				fontSize: 'medium',
			},
		},
	},
];
