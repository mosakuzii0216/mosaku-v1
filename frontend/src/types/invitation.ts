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
