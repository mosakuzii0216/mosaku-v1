/**
 * 招待コード関連エラーコード（backend `ERROR_CODES.INVITATION` と同期）
 */
export const INVITATION_ERROR_CODES = {
	INVALID_CODE: 'INV001',
	EXPIRED: 'INV002',
	MAX_USES_REACHED: 'INV003',
	NOT_FOUND: 'INV004',
	QUOTA_EXHAUSTED: 'INV005',
} as const;

export type InvitationErrorCode =
	(typeof INVITATION_ERROR_CODES)[keyof typeof INVITATION_ERROR_CODES];

export interface InvitationCode {
	id: string;
	code: string;
	maxUses: number;
	usedCount: number;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateInvitationDto {
	maxUses: number;
	expiresAt: string | null;
}

/**
 * 招待コード検証のレスポンス型
 */
export interface InvitationVerificationResponse {
	valid: boolean;
	code: string;
	maxUses: number | null;
	currentUses: number;
	expiresAt: Date | null;
	isActive: boolean;
}

/**
 * 招待コードの招待者文脈レスポンス（受信者向け / `POST /invitation/verify-context`）
 * email など PII は含まない
 */
export interface InvitationContextResponse {
	code: string;
	status: 'valid';
	creator: {
		name: string | null;
		maskedId: string;
	};
	expiresAt: string | null;
	usesRemaining: number;
}

/**
 * 共有 URL 付きの招待コードレスポンス（`POST /invitation/me` / `GET /invitation/me`）
 */
export interface InvitationWithShareUrlResponse {
	id: string;
	code: string;
	shareUrl: string;
	maxUses: number;
	usedCount: number;
	expiresAt: string | null;
	createdAt: string;
}

/**
 * ユーザーの招待 quota スナップショット（`GET /invitation/me/quota`）
 */
export interface UserQuotaResponse {
	invitationQuota: number;
	unlimited: boolean;
	role: 'USER' | 'ADMIN';
}

/**
 * OAuth 開始エンドポイントの対象プロバイダ
 */
export type InvitationOAuthProvider = 'google' | 'github' | 'line' | 'apple' | 'x';

/**
 * OAuth 開始エンドポイントのレスポンス（`POST /auth/oauth/:provider/start`）
 */
export interface OAuthStartResponse {
	authorizationUrl: string;
}
