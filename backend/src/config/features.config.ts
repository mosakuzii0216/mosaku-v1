/**
 * フィーチャーフラグシステム
 *
 * 機能の段階的リリースや実験的機能の制御に使用
 *
 */

/**
 * 環境変数から真偽値を取得するヘルパー
 * @param envVar 環境変数の値
 * @param defaultValue デフォルト値
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
	 * パスワードリセットメール送信機能
	 * - true: メール送信を実行
	 * - false: トークンのみ返す（開発用）
	 *
	 * 環境変数: FEATURE_PASSWORD_RESET_EMAIL
	 * デフォルト: false（開発環境ではメール送信しない）
	 */
	PASSWORD_RESET_EMAIL: getFeatureFlag(process.env.FEATURE_PASSWORD_RESET_EMAIL, false),

	/**
	 * ページネーションAPI
	 * - true: ページネーション対応エンドポイント有効
	 * - false: 従来の全件取得のみ
	 *
	 * 環境変数: FEATURE_PAGINATION
	 * デフォルト: true（実装済み）
	 */
	PAGINATION: getFeatureFlag(process.env.FEATURE_PAGINATION, true),

	/**
	 * 詳細ログ出力
	 * - true: デバッグログを出力
	 * - false: 本番用の最小限のログのみ
	 *
	 * 環境変数: FEATURE_VERBOSE_LOGGING
	 * デフォルト: 開発環境ではtrue
	 */
	VERBOSE_LOGGING: getFeatureFlag(
		process.env.FEATURE_VERBOSE_LOGGING,
		process.env.NODE_ENV !== 'production',
	),

	/**
	 * MCP（Model Context Protocol）エンドポイント
	 * - true: `/mcp` および OAuth 認可サーバー入口を有効化
	 * - false: MCP 入口を完全に無効化（既存機能には無影響）
	 *
	 * 環境変数: FEATURE_MCP_ENDPOINT
	 * デフォルト: false（段階公開のため既定で off。flag off で本番デプロイ可能）
	 */
	MCP_ENDPOINT: getFeatureFlag(process.env.FEATURE_MCP_ENDPOINT, false),
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

/**
 * 全フィーチャーフラグの状態を取得（デバッグ用）
 */
export function getAllFeatureFlags(): Record<FeatureKey, boolean> {
	return { ...FEATURES };
}
