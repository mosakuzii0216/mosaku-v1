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
