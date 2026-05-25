import { describe, it, expect } from 'vitest';
import { INVITATION_ERROR_CODES } from '../types/invitation';
import { invitationErrorMessages, resolveInvitationErrorMessage } from './invitationErrorMessages';

describe('invitationErrorMessages', () => {
	it('INV001 (INVALID_CODE) に対応する日本語文言を返す', () => {
		expect(invitationErrorMessages[INVITATION_ERROR_CODES.INVALID_CODE]).toBe(
			'招待コードが無効です',
		);
	});

	it('INV002 (EXPIRED) に対応する日本語文言を返す', () => {
		expect(invitationErrorMessages[INVITATION_ERROR_CODES.EXPIRED]).toBe(
			'招待コードの有効期限が切れています',
		);
	});

	it('INV003 (MAX_USES_REACHED) に対応する日本語文言を返す', () => {
		expect(invitationErrorMessages[INVITATION_ERROR_CODES.MAX_USES_REACHED]).toBe(
			'招待コードの使用上限に達しました',
		);
	});

	it('INV004 (NOT_FOUND) に対応する日本語文言を返す', () => {
		expect(invitationErrorMessages[INVITATION_ERROR_CODES.NOT_FOUND]).toBe(
			'招待コードが見つかりません',
		);
	});

	it('INV005 (QUOTA_EXHAUSTED) に対応する日本語文言を返す', () => {
		expect(invitationErrorMessages[INVITATION_ERROR_CODES.QUOTA_EXHAUSTED]).toBe(
			'招待枠を使い切りました',
		);
	});

	it('全 5 コードを網羅している（型レベルで mapping が抜けないことを保証）', () => {
		const keys = Object.values(INVITATION_ERROR_CODES);
		for (const key of keys) {
			expect(invitationErrorMessages[key]).toBeTruthy();
		}
	});
});

describe('resolveInvitationErrorMessage', () => {
	it('既知のコードはマッピング済みの文言を返す', () => {
		expect(resolveInvitationErrorMessage(INVITATION_ERROR_CODES.INVALID_CODE)).toBe(
			'招待コードが無効です',
		);
	});

	it('未知のコードに対しては汎用フォールバック文言を返す', () => {
		expect(resolveInvitationErrorMessage('INV999')).toBe(
			'招待コードでエラーが発生しました。時間をおいて再度お試しください',
		);
	});

	it('null/undefined に対しても汎用フォールバック文言を返す', () => {
		expect(resolveInvitationErrorMessage(null)).toBe(
			'招待コードでエラーが発生しました。時間をおいて再度お試しください',
		);
		expect(resolveInvitationErrorMessage(undefined)).toBe(
			'招待コードでエラーが発生しました。時間をおいて再度お試しください',
		);
	});
});
