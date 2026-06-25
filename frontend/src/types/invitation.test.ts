import { describe, it, expect } from 'vitest';
import {
	INVITATION_ERROR_CODES,
	type InvitationErrorCode,
	type InvitationPerkView,
	MAX_CAMPAIGN_MAX_USES,
	MAX_ACTIVE_INVITE_CODES,
} from './invitation';

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

describe('InvitationPerkView（backend InvitationPerkType enum と同期）', () => {
	it('none を受け入れること', () => {
		const perk: InvitationPerkView = { type: 'none' };
		expect(perk.type).toBe('none');
	});

	it('comp と months を受け入れること', () => {
		const perk: InvitationPerkView = { type: 'comp', months: 3 };
		expect(perk.type).toBe('comp');
		expect((perk as Extract<InvitationPerkView, { type: 'comp' }>).months).toBe(3);
	});
});

describe('キャンペーン定数（backend invitation/constants.ts と同期）', () => {
	it('MAX_CAMPAIGN_MAX_USES が 20 であること', () => {
		expect(MAX_CAMPAIGN_MAX_USES).toBe(20);
	});

	it('MAX_ACTIVE_INVITE_CODES が 3 であること', () => {
		expect(MAX_ACTIVE_INVITE_CODES).toBe(3);
	});
});
