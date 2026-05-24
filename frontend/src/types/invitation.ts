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
