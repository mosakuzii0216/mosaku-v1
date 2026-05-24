import { describe, it, expect } from 'vitest';
import { INVITATION_ERROR_CODES, type InvitationErrorCode } from './invitation';

describe('INVITATION_ERROR_CODES', () => {
	it('Backend と一致する INV001〜INV005 を持つこと', () => {
		expect(INVITATION_ERROR_CODES.INVALID_CODE).toBe('INV001');
		expect(INVITATION_ERROR_CODES.EXPIRED).toBe('INV002');
		expect(INVITATION_ERROR_CODES.MAX_USES_REACHED).toBe('INV003');
		expect(INVITATION_ERROR_CODES.NOT_FOUND).toBe('INV004');
		expect(INVITATION_ERROR_CODES.QUOTA_EXHAUSTED).toBe('INV005');
	});

	it('InvitationErrorCode 型が QUOTA_EXHAUSTED を受け入れること', () => {
		const code: InvitationErrorCode = INVITATION_ERROR_CODES.QUOTA_EXHAUSTED;
		expect(code).toBe('INV005');
	});
});
