import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { XRegisterStartGuard } from './x-register-start.guard';
import { InvitationStateInvalidException } from './x-register-start.exception';
import type { InvitationStateService } from './invitation-state.service';

describe('XRegisterStartGuard', () => {
	let guard: XRegisterStartGuard;
	let mockInvitationStateService: { verifyState: jest.Mock };

	const buildContext = (
		query: Record<string, unknown>,
		session: Record<string, unknown> = {},
	): ExecutionContext =>
		({
			switchToHttp: () => ({
				getRequest: () => ({ query, session }),
				getResponse: jest.fn(),
				getNext: jest.fn(),
			}),
			getClass: jest.fn(),
			getHandler: jest.fn(),
			getArgs: jest.fn(),
			getArgByIndex: jest.fn(),
			switchToRpc: jest.fn(),
			switchToWs: jest.fn(),
			getType: () => 'http',
		}) as unknown as ExecutionContext;

	beforeEach(() => {
		mockInvitationStateService = { verifyState: jest.fn() };
		guard = new XRegisterStartGuard(
			mockInvitationStateService as unknown as InvitationStateService,
		);
		// passport の super.canActivate をモック（twitter へのリダイレクトをスキップ）
		jest.spyOn(AuthGuard('x').prototype, 'canActivate').mockImplementation(() => true);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('有効な signedState → session.xInvitationCode を設定し super.canActivate を呼ぶこと', () => {
		mockInvitationStateService.verifyState.mockReturnValue({
			code: 'INV-CODE-123',
			provider: 'x',
			nonce: 'nonce',
			iat: Date.now(),
		});

		const session: Record<string, unknown> = {};
		const ctx = buildContext({ state: 'valid.signed.state' }, session);

		const result = guard.canActivate(ctx);

		expect(result).toBe(true);
		expect(session.xInvitationCode).toBe('INV-CODE-123');
		expect(mockInvitationStateService.verifyState).toHaveBeenCalledWith('valid.signed.state', 'x');
	});

	it('無効な signedState（verifyState が throw）→ InvitationStateInvalidException を throw すること', () => {
		mockInvitationStateService.verifyState.mockImplementation(() => {
			throw new Error('Invalid state');
		});

		const ctx = buildContext({ state: 'tampered.state' });

		expect(() => guard.canActivate(ctx)).toThrow(InvitationStateInvalidException);
	});

	it('state 欠落 → InvitationStateInvalidException を throw すること', () => {
		const ctx = buildContext({});

		expect(() => guard.canActivate(ctx)).toThrow(InvitationStateInvalidException);
	});

	it('空文字 state → InvitationStateInvalidException を throw すること', () => {
		const ctx = buildContext({ state: '' });

		expect(() => guard.canActivate(ctx)).toThrow(InvitationStateInvalidException);
	});

	it('招待コードを state から抽出して InvitationStateInvalidException.invitationCode にセットすること', () => {
		const payload = { code: 'EXTRACT-CODE', provider: 'x', nonce: 'n', iat: 123 };
		const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
		const tamperedState = `${encoded}.invalidsig`;

		mockInvitationStateService.verifyState.mockImplementation(() => {
			throw new Error('signature mismatch');
		});

		const ctx = buildContext({ state: tamperedState });

		let caughtException: InvitationStateInvalidException | undefined;
		try {
			guard.canActivate(ctx);
		} catch (e) {
			caughtException = e as InvitationStateInvalidException;
		}

		expect(caughtException).toBeInstanceOf(InvitationStateInvalidException);
		expect(caughtException?.invitationCode).toBe('EXTRACT-CODE');
	});

	it('state を持たない session があっても xInvitationCode が undefined（login 分岐の前提）', () => {
		const session: Record<string, unknown> = {};
		expect(session.xInvitationCode).toBeUndefined();
	});
});
