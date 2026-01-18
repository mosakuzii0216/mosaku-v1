/**
 * フィーチャーフラグシステム
 *
 * 機能の段階的リリースや実験的機能の制御に使用
 *
 * 使用方法:
 * 1. 環境変数で機能を有効/無効化
 *    例: FEATURE_PASSWORD_RESET_EMAIL=true
 *
 * 2. コードで機能の有効性をチェック
 *    例: if (FEATURES.PASSWORD_RESET_EMAIL) { ... }
 *
 * 3. デフォルト値の設定
 *    - 安定した機能: デフォルトで有効（!== 'false'）
 *    - 実験的機能: デフォルトで無効（=== 'true'）
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
	 * X (Twitter) OAuth認証
	 * - true: X OAuth有効
	 * - false: X OAuth無効（コメントアウト中）
	 *
	 * 環境変数: FEATURE_OAUTH_X
	 * デフォルト: false（現在無効）
	 */
	OAUTH_X: getFeatureFlag(process.env.FEATURE_OAUTH_X, false),

	/**
	 * プレミアム機能
	 * - true: プレミアム機能有効
	 * - false: プレミアム機能無効
	 *
	 * 環境変数: FEATURE_PREMIUM
	 * デフォルト: false
	 */
	PREMIUM_FEATURES: getFeatureFlag(process.env.FEATURE_PREMIUM, false),

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
	 * レガシーSyncエンドポイント
	 * - true: 後方互換性のためのエンドポイント有効
	 * - false: レガシーエンドポイント無効
	 *
	 * 環境変数: FEATURE_LEGACY_SYNC
	 * デフォルト: true（移行期間中は有効）
	 */
	LEGACY_SYNC_ENDPOINTS: getFeatureFlag(process.env.FEATURE_LEGACY_SYNC, true),

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
