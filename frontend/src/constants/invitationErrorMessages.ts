import { INVITATION_ERROR_CODES, type InvitationErrorCode } from '../types/invitation';

const FALLBACK_MESSAGE = '招待コードでエラーが発生しました。時間をおいて再度お試しください';

export const invitationErrorMessages: Record<InvitationErrorCode, string> = {
	[INVITATION_ERROR_CODES.INVALID_CODE]: '招待コードが無効です',
	[INVITATION_ERROR_CODES.EXPIRED]: '招待コードの有効期限が切れています',
	[INVITATION_ERROR_CODES.MAX_USES_REACHED]: '招待コードの使用上限に達しました',
	[INVITATION_ERROR_CODES.NOT_FOUND]: '招待コードが見つかりません',
	[INVITATION_ERROR_CODES.QUOTA_EXHAUSTED]: '招待枠を使い切りました',
};

function isKnownInvitationErrorCode(code: string): code is InvitationErrorCode {
	return Object.prototype.hasOwnProperty.call(invitationErrorMessages, code);
}

export function resolveInvitationErrorMessage(code: string | null | undefined): string {
	if (!code || !isKnownInvitationErrorCode(code)) {
		return FALLBACK_MESSAGE;
	}
	return invitationErrorMessages[code];
}
