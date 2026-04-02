import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LineRegisterWithInvitationDto } from './line-register-with-invitation.dto';
import { AppleRegisterWithInvitationDto } from './apple-register-with-invitation.dto';
import { XRegisterWithInvitationDto } from './x-register-with-invitation.dto';

describe('LineRegisterWithInvitationDto', () => {
	it('有効なリクエストはバリデーションを通過すること', async () => {
		const dto = plainToInstance(LineRegisterWithInvitationDto, {
			lineUser: { lineId: 'U1234', name: 'LINE User' },
			invitationCode: 'CODE123',
		});
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('invitationCode が空の場合にバリデーションエラーが発生すること', async () => {
		const dto = plainToInstance(LineRegisterWithInvitationDto, {
			lineUser: { lineId: 'U1234', name: 'LINE User' },
			invitationCode: '',
		});
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'invitationCode')).toBe(true);
	});

	it('lineUser がオブジェクトでない場合にバリデーションエラーが発生すること', async () => {
		const dto = plainToInstance(LineRegisterWithInvitationDto, {
			lineUser: 'not-an-object',
			invitationCode: 'CODE123',
		});
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'lineUser')).toBe(true);
	});
});

describe('AppleRegisterWithInvitationDto', () => {
	it('有効なリクエスト（fallbackEmail あり）はバリデーションを通過すること', async () => {
		const dto = plainToInstance(AppleRegisterWithInvitationDto, {
			appleUser: { appleId: 'sub-id', name: 'Apple User' },
			invitationCode: 'CODE123',
			fallbackEmail: 'user@example.com',
		});
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('有効なリクエスト（fallbackEmail なし）もバリデーションを通過すること', async () => {
		const dto = plainToInstance(AppleRegisterWithInvitationDto, {
			appleUser: { appleId: 'sub-id', name: 'Apple User' },
			invitationCode: 'CODE123',
		});
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('fallbackEmail が不正なメール形式の場合にバリデーションエラーが発生すること', async () => {
		const dto = plainToInstance(AppleRegisterWithInvitationDto, {
			appleUser: { appleId: 'sub-id', name: 'Apple User' },
			invitationCode: 'CODE123',
			fallbackEmail: 'not-an-email',
		});
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'fallbackEmail')).toBe(true);
	});
});

describe('XRegisterWithInvitationDto', () => {
	it('有効なリクエストはバリデーションを通過すること', async () => {
		const dto = plainToInstance(XRegisterWithInvitationDto, {
			xUser: { xId: '1234', name: 'X User' },
			invitationCode: 'CODE123',
		});
		const errors = await validate(dto);
		expect(errors).toHaveLength(0);
	});

	it('invitationCode が未設定の場合にバリデーションエラーが発生すること', async () => {
		const dto = plainToInstance(XRegisterWithInvitationDto, {
			xUser: { xId: '1234', name: 'X User' },
		});
		const errors = await validate(dto);
		expect(errors.some((e) => e.property === 'invitationCode')).toBe(true);
	});
});
