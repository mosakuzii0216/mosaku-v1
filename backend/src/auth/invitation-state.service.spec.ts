import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config/config.service';
import { AppException } from '../common/exceptions';
import { InvitationStateService } from './invitation-state.service';
describe('InvitationStateService', () => {
	let service: InvitationStateService;

	const secret = 'a'.repeat(64);

	const mockConfigService = {
		get invitationStateSecret(): string {
			return secret;
		},
	};

	const buildService = async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [InvitationStateService, { provide: ConfigService, useValue: mockConfigService }],
		}).compile();

		return module.get<InvitationStateService>(InvitationStateService);
	};

	beforeEach(async () => {
		service = await buildService();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('issueState → verifyState で payload を復元できること（正常往復）', () => {
		const state = service.issueState('CODE123', 'google');
		const payload = service.verifyState(state, 'google');

		expect(payload.code).toBe('CODE123');
		expect(payload.provider).toBe('google');
		expect(payload.nonce).toMatch(/^[0-9a-f]{32}$/);
		expect(typeof payload.iat).toBe('number');
	});

	it('発行する state が base64url(payload).base64url(signature) 形式の単一文字列であること', () => {
		const state = service.issueState('CODE123', 'google');

		expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
	});

	it('ペイロード改ざんがあると INV001 で拒否されること', () => {
		const state = service.issueState('CODE123', 'google');
		const [, signature] = state.split('.');
		const tamperedPayload = Buffer.from(
			JSON.stringify({
				code: 'EVIL',
				provider: 'google',
				nonce: 'a'.repeat(32),
				iat: Date.now(),
			}),
		).toString('base64url');
		const tampered = `${tamperedPayload}.${signature}`;

		expect(() => service.verifyState(tampered, 'google')).toThrow(AppException);
	});

	it('iat が 10 分以上経過した state は拒否されること', () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const state = service.issueState('CODE123', 'google');

		jest.setSystemTime(new Date('2026-01-01T00:10:01Z'));

		expect(() => service.verifyState(state, 'google')).toThrow(AppException);
	});

	it('provider 不一致は拒否されること', () => {
		const state = service.issueState('CODE123', 'google');

		expect(() => service.verifyState(state, 'github')).toThrow(AppException);
	});

	it('base64 不正な文字列は拒否されること', () => {
		expect(() => service.verifyState('not-a-valid-state', 'google')).toThrow(AppException);
	});

	it('セパレータ . を持たない文字列は拒否されること', () => {
		expect(() => service.verifyState('abcdefg', 'google')).toThrow(AppException);
	});

	it('nonce は呼び出しごとに異なること（randomBytes 由来）', () => {
		const s1 = service.issueState('CODE123', 'google');
		const s2 = service.issueState('CODE123', 'google');
		const p1 = service.verifyState(s1, 'google');
		const p2 = service.verifyState(s2, 'google');

		expect(p1.nonce).not.toBe(p2.nonce);
	});

	it('INVITATION_STATE_SECRET 未設定時はサービス利用で初期化エラーになること', async () => {
		const failingConfig = {
			get invitationStateSecret(): string {
				throw new Error('INVITATION_STATE_SECRET is not configured');
			},
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [InvitationStateService, { provide: ConfigService, useValue: failingConfig }],
		}).compile();

		const broken = module.get<InvitationStateService>(InvitationStateService);
		expect(() => broken.issueState('CODE123', 'google')).toThrow(/INVITATION_STATE_SECRET/);
	});
});
