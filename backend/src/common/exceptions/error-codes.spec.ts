import { ERROR_CODES, type ErrorCode } from './error-codes';
import { ERROR_MESSAGES } from './error-messages';

describe('ERROR_CODES.INVITATION', () => {
	it('QUOTA_EXHAUSTED が INV005 として定義されていること', () => {
		expect(ERROR_CODES.INVITATION.QUOTA_EXHAUSTED).toBe('INV005');
	});

	it('既存の招待コード（INV001〜INV004）が変更されていないこと', () => {
		expect(ERROR_CODES.INVITATION.INVALID_CODE).toBe('INV001');
		expect(ERROR_CODES.INVITATION.EXPIRED).toBe('INV002');
		expect(ERROR_CODES.INVITATION.MAX_USES_REACHED).toBe('INV003');
		expect(ERROR_CODES.INVITATION.NOT_FOUND).toBe('INV004');
	});

	it('ErrorCode 型が QUOTA_EXHAUSTED を含んでいること（型レベルの網羅性）', () => {
		const code: ErrorCode = ERROR_CODES.INVITATION.QUOTA_EXHAUSTED;
		expect(code).toBe('INV005');
	});
});

describe('ERROR_MESSAGES', () => {
	it('QUOTA_EXHAUSTED に日本語メッセージが対応していること', () => {
		expect(ERROR_MESSAGES[ERROR_CODES.INVITATION.QUOTA_EXHAUSTED]).toBe('招待枠を使い切りました');
	});

	it('全 ErrorCode に対応するメッセージが存在すること（網羅性）', () => {
		const allCodes: ErrorCode[] = [
			...Object.values(ERROR_CODES.AUTH),
			...Object.values(ERROR_CODES.AUTHZ),
			...Object.values(ERROR_CODES.RESOURCE),
			...Object.values(ERROR_CODES.VALIDATION),
			...Object.values(ERROR_CODES.INVITATION),
		];
		for (const code of allCodes) {
			expect(ERROR_MESSAGES[code]).toBeDefined();
			expect(typeof ERROR_MESSAGES[code]).toBe('string');
		}
	});
});
