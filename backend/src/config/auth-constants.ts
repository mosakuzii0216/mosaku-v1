/**
 * 認証関連の定数設定
 * 環境変数から読み取り、デフォルト値を提供
 */

/**
 * bcryptのソルトラウンド数
 * 推奨値: 10-12（セキュリティと性能のバランス）
 */
export const BCRYPT_SALT_ROUNDS = parseInt(
	process.env.BCRYPT_SALT_ROUNDS || '12',
	10,
);

/**
 * JWT有効期限
 * デフォルト: 24時間
 */
export const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';

/**
 * レート制限設定
 */
export const THROTTLE_CONFIG = {
	/**
	 * ユーザー登録のレート制限
	 * デフォルト: 1分間に5回まで
	 */
	REGISTER: {
		LIMIT: parseInt(process.env.REGISTER_THROTTLE_LIMIT || '5', 10),
		TTL: parseInt(process.env.REGISTER_THROTTLE_TTL || '60000', 10), // 1分
	},
	/**
	 * ログインのレート制限（ブルートフォース対策）
	 * デフォルト: 15分間に5回まで
	 */
	LOGIN: {
		LIMIT: parseInt(process.env.LOGIN_THROTTLE_LIMIT || '5', 10),
		TTL: parseInt(process.env.LOGIN_THROTTLE_TTL || '900000', 10), // 15分
	},
} as const;
