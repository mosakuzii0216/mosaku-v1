/**
 * アプリケーション全体で使用するエラーコード定数
 *
 * コード体系:
 * - AUTH001~: 認証エラー
 * - AUTHZ001~: 認可エラー
 * - RES001~: リソースエラー
 * - VAL001~: バリデーションエラー
 * - INV001~: 招待コードエラー
 */

export const ERROR_CODES = {
	// 認証エラー (AUTH001~)
	AUTH: {
		INVALID_CREDENTIALS: 'AUTH001',
		AUTHENTICATION_REQUIRED: 'AUTH002',
		INVALID_TOKEN: 'AUTH003',
		USER_NOT_FOUND: 'AUTH004',
		INVITATION_REQUIRED: 'AUTH005',
		EMAIL_ALREADY_EXISTS: 'AUTH006',
		USER_ALREADY_EXISTS: 'AUTH007',
		PASSWORD_NOT_SET: 'AUTH008',
		INVALID_PASSWORD: 'AUTH009',
		// Refresh Token 系（全て HTTP 401）
		// AUTH010: Cookie 不在 / 形式不正 / ハッシュ不一致など、サーバー側で RT を識別できないケース
		REFRESH_TOKEN_INVALID: 'AUTH010',
		// AUTH011: ログアウト・パスワード変更・管理操作により明示的に revoked された RT を再使用したケース
		REFRESH_TOKEN_REVOKED: 'AUTH011',
		// AUTH012: rotated 済みの旧 RT が再使用されたケース。同一 family を全 revoke + Sentry warning
		REFRESH_TOKEN_REUSED: 'AUTH012',
		// AUTH013: expiresAt を過ぎた RT が使われたケース。FE はログイン画面に静かにフォールバック
		REFRESH_TOKEN_EXPIRED: 'AUTH013',
	},

	// 認可エラー (AUTHZ001~)
	AUTHZ: {
		FORBIDDEN: 'AUTHZ001',
		NOT_OWNER: 'AUTHZ002',
		ADMIN_ONLY: 'AUTHZ003',
		NO_PERMISSION: 'AUTHZ004',
		ADMIN_EMAIL_REQUIRED: 'AUTHZ005',
	},

	// リソースエラー (RES001~)
	RESOURCE: {
		NOT_FOUND: 'RES001',
		ALREADY_EXISTS: 'RES002',
		IN_USE: 'RES003',
		ALREADY_FAVORITED: 'RES004',
		NOT_FAVORITED: 'RES005',
		CONFLICT: 'RES006',
	},

	// バリデーションエラー (VAL001~)
	VALIDATION: {
		INVALID_INPUT: 'VAL001',
		REQUIRED_FIELD: 'VAL002',
		INVALID_FORMAT: 'VAL003',
		MISSING_CSS_OR_STYLES: 'VAL004',
		MISSING_REQUIRED_STYLE_FIELD: 'VAL005',
		INVALID_PAYLOAD: 'VAL006',
	},

	// 招待コードエラー (INV001~)
	INVITATION: {
		INVALID_CODE: 'INV001',
		EXPIRED: 'INV002',
		MAX_USES_REACHED: 'INV003',
		NOT_FOUND: 'INV004',
	},
} as const;

// エラーコードの型を抽出
type ExtractErrorCodes<T> =
	T extends Record<string, infer U> ? (U extends Record<string, infer V> ? V : never) : never;

export type ErrorCode = ExtractErrorCodes<typeof ERROR_CODES>;
