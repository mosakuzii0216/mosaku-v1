/**
 * 認証関連の定数設定
 * 環境変数から読み取り、デフォルト値を提供
 */

import type { StringValue } from 'ms';

/**
 * bcryptのソルトラウンド数
 * 推奨値: 10-12（セキュリティと性能のバランス）
 */
export const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

/**
 * Access Token 有効期限
 * デフォルト: 15分（Refresh Token 導入に合わせて短命化）
 *
 * 型: @nestjs/jwt v11 の signOptions.expiresIn は number | ms.StringValue を要求するため、
 * テンプレートリテラル型 `${number}${Unit}` に合致する形で型付けする。
 *
 * 旧来 24h Access Token は exp まで通常受理する（design.md §6.3 互換性方針）。
 */
export const JWT_EXPIRATION: StringValue = (process.env.JWT_EXPIRATION as StringValue) || '15m';

/**
 * Refresh Token 有効期限
 * デフォルト: 30日。env でコード変更なしに調整可能。
 */
export const REFRESH_TOKEN_EXPIRATION: StringValue =
	(process.env.REFRESH_TOKEN_EXPIRATION as StringValue) || '30d';

/**
 * MCP アクセストークン有効期限
 * 通常の REST トークン（15m）より長め・リフレッシュ回転前提の短命設定。
 * デフォルト: 1時間。env で上書き可能。
 */
export const MCP_ACCESS_TOKEN_EXPIRATION: StringValue =
	(process.env.MCP_ACCESS_TOKEN_EXPIRATION as StringValue) || '1h';

/**
 * Refresh Token Cookie 名。サーバー側で一元管理し、FE には公開しない。
 */
export const REFRESH_COOKIE_NAME = 'refresh_token' as const;

const MS_PER_MINUTE = 60_000;

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
		TTL: parseInt(process.env.REGISTER_THROTTLE_TTL || String(1 * MS_PER_MINUTE), 10),
	},
	/**
	 * ログインのレート制限（ブルートフォース対策）
	 * `POST oauth/:provider/start` と `POST login` に適用。OAuth が主経路のため
	 * 共有 IP（同一 WiFi / NAT）配下で複数人が同時ログインしてもブロックしない値にする。
	 * デフォルト: 15分間に15回まで
	 */
	LOGIN: {
		LIMIT: parseInt(process.env.LOGIN_THROTTLE_LIMIT || '15', 10),
		TTL: parseInt(process.env.LOGIN_THROTTLE_TTL || String(15 * MS_PER_MINUTE), 10),
	},
	/**
	 * `/auth/refresh` `/auth/logout` のレート制限
	 * デフォルト: 1分間に10回まで（design.md §Rate Limiting）
	 */
	REFRESH: {
		LIMIT: parseInt(process.env.REFRESH_THROTTLE_LIMIT || '10', 10),
		TTL: parseInt(process.env.REFRESH_THROTTLE_TTL || String(1 * MS_PER_MINUTE), 10),
	},
	/**
	 * 全エンドポイント共通のグローバルレート制限（IP 単位）
	 * SPA 初回ロードで複数 API を叩くため、共有 IP でも詰まらない値にする。
	 * デフォルト: 60秒間に60回まで
	 */
	GLOBAL: {
		LIMIT: parseInt(process.env.GLOBAL_THROTTLE_LIMIT || '60', 10),
		TTL: parseInt(process.env.GLOBAL_THROTTLE_TTL || String(1 * MS_PER_MINUTE), 10),
	},
	/**
	 * パスワードリセット要求・確定のレート制限（総当たり・スパム送信対策）
	 * デフォルト: 15分間に5回まで。env で上書き可能。
	 */
	PASSWORD_RESET: {
		LIMIT: parseInt(process.env.PASSWORD_RESET_THROTTLE_LIMIT || '5', 10),
		TTL: parseInt(process.env.PASSWORD_RESET_THROTTLE_TTL || String(15 * MS_PER_MINUTE), 10),
	},
	/**
	 * MCP tool 実行エンドポイントのレート制限（AI クライアントの連続実行対策）
	 * デフォルト: 1分間に30回まで。env で上書き可能。
	 * グローバル (60/min) より低めに設定し、AI クライアントが短時間に集中送信しても
	 * 他のユーザーの REST 操作に影響しないようにする（R6.4）。
	 */
	MCP: {
		LIMIT: parseInt(process.env.MCP_THROTTLE_LIMIT || '30', 10),
		TTL: parseInt(process.env.MCP_THROTTLE_TTL || String(1 * MS_PER_MINUTE), 10),
	},
	/**
	 * MCP OAuth 認可エンドポイント（register / authorize / token）のレート制限
	 * デフォルト: 1分間に10回まで（DCR 濫用・総当たり対策）。env で上書き可能。
	 */
	MCP_OAUTH: {
		LIMIT: parseInt(process.env.MCP_OAUTH_THROTTLE_LIMIT || '10', 10),
		TTL: parseInt(process.env.MCP_OAUTH_THROTTLE_TTL || String(1 * MS_PER_MINUTE), 10),
	},
} as const;
