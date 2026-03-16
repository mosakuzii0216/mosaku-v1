/**
 * フィーチャーフラグシステム（フロントエンド）
 *
 * 機能の段階的リリースや実験的機能の制御に使用
 *
 * 使用方法:
 * 1. 環境変数で機能を有効/無効化
 *    例: VITE_FEATURE_X_OAUTH=true
 *
 * 2. コードで機能の有効性をチェック
 *    例: if (FEATURES.OAUTH_X) { ... }
 *
 * 注意: Viteでは環境変数に VITE_ プレフィックスが必要
 */

/**
 * 環境変数から真偽値を取得するヘルパー
 */
function getFeatureFlag(envVar: string | undefined, defaultValue: boolean): boolean {
	if (envVar === undefined) {
		return defaultValue;
	}
	return envVar.toLowerCase() === 'true';
}

/**
 * 機能フラグの定義
 */
export const FEATURES = {
	/**
	 * X (Twitter) OAuth認証
	 * - true: X OAuthボタンを表示
	 * - false: X OAuthボタンを非表示
	 *
	 * 環境変数: VITE_FEATURE_OAUTH_X
	 * デフォルト: false（現在バックエンドで無効）
	 */
	OAUTH_X: getFeatureFlag(import.meta.env.VITE_FEATURE_OAUTH_X, false),

	/**
	 * ページネーションUI
	 * - true: ページネーション対応UI有効
	 * - false: 従来の全件表示のみ
	 *
	 * 環境変数: VITE_FEATURE_PAGINATION_UI
	 * デフォルト: true（実装済み）
	 */
	PAGINATION_UI: getFeatureFlag(import.meta.env.VITE_FEATURE_PAGINATION_UI, true),

	/**
	 * 開発者ツール
	 * - true: 開発者向けUIを表示
	 * - false: 開発者ツールを非表示
	 *
	 * 環境変数: VITE_FEATURE_DEV_TOOLS
	 * デフォルト: 開発環境のみtrue
	 */
	DEV_TOOLS: getFeatureFlag(import.meta.env.VITE_FEATURE_DEV_TOOLS, import.meta.env.DEV),

	/**
	 * パスワードリセット機能のUI
	 * - true: パスワードリセットフォームを有効化
	 * - false: パスワードリセットフォームを無効化
	 *
	 * 環境変数: VITE_FEATURE_PASSWORD_RESET
	 * デフォルト: true（フォームは常に表示、バックエンドでメール送信を制御）
	 */
	PASSWORD_RESET_UI: getFeatureFlag(import.meta.env.VITE_FEATURE_PASSWORD_RESET, true),

	/**
	 * テーマカスタマイズ機能
	 * - true: ユーザーによるテーマカスタマイズを有効化
	 * - false: システムテーマのみ使用可能
	 *
	 * 環境変数: VITE_FEATURE_THEME_CUSTOMIZATION
	 * デフォルト: false（管理者のみテーマ作成可能）
	 */
	THEME_CUSTOMIZATION: getFeatureFlag(import.meta.env.VITE_FEATURE_THEME_CUSTOMIZATION, false),
} as const;

/**
 * フィーチャーフラグの型
 */
export type FeatureFlags = typeof FEATURES;

/**
 * フィーチャーフラグのキー
 */
export type FeatureKey = keyof FeatureFlags;

/**
 * 実行時にフィーチャーフラグを確認するヘルパー関数
 */
export function isFeatureEnabled(feature: FeatureKey): boolean {
	return FEATURES[feature];
}

/**
 * 複数のフィーチャーフラグを確認するヘルパー関数
 */
export function areAllFeaturesEnabled(...features: FeatureKey[]): boolean {
	return features.every((feature) => FEATURES[feature]);
}

/**
 * いずれかのフィーチャーフラグが有効かを確認するヘルパー関数
 */
export function isAnyFeatureEnabled(...features: FeatureKey[]): boolean {
	return features.some((feature) => FEATURES[feature]);
}
