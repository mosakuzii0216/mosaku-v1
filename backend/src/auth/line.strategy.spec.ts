import { ServiceUnavailableException } from '@nestjs/common';
import { LineStrategy } from './line.strategy';
import { ConfigService } from '../config/config.service';

jest.mock('passport-line-auth', () => ({
	Strategy: class MockLineStrategy {
		name = 'line';
		constructor(
			_options: unknown,
			public verify: (
				accessToken: string,
				refreshToken: string,
				profile: unknown,
				done: (err: unknown, user?: unknown) => void,
			) => void,
		) {}
	},
}));

jest.mock('@nestjs/passport', () => ({
	PassportStrategy: (Strategy: new (...args: unknown[]) => unknown) => Strategy,
}));

describe('LineStrategy', () => {
	const mockConfigService = {
		lineClientId: 'line-client-id',
		lineClientSecret: 'line-client-secret',
		lineRedirectUri: 'http://localhost:3000/auth/line/callback',
	} as unknown as ConfigService;

	describe('constructor', () => {
		it('クレデンシャルが設定されている場合に正常に初期化されること', () => {
			expect(() => new LineStrategy(mockConfigService)).not.toThrow();
		});

		it('lineClientId が未設定の場合にエラーをスローしないこと（警告ログのみ）', () => {
			const noClientId = {
				...mockConfigService,
				lineClientId: undefined,
			} as unknown as ConfigService;
			expect(() => new LineStrategy(noClientId)).not.toThrow();
		});

		it('lineClientSecret が未設定の場合にエラーをスローしないこと（警告ログのみ）', () => {
			const noSecret = {
				...mockConfigService,
				lineClientSecret: undefined,
			} as unknown as ConfigService;
			expect(() => new LineStrategy(noSecret)).not.toThrow();
		});

		it('クレデンシャル未設定の場合に警告ログを出力すること', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
			const noClientId = {
				...mockConfigService,
				lineClientId: undefined,
			} as unknown as ConfigService;
			new LineStrategy(noClientId);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LINE'));
			warnSpy.mockRestore();
		});
	});

	describe('validate()', () => {
		let strategy: LineStrategy;

		beforeEach(() => {
			strategy = new LineStrategy(mockConfigService);
		});

		it('LINE プロフィールを LineStrategyUser に変換すること', () => {
			const profile = {
				id: 'U1234567890',
				displayName: 'テストユーザー',
				pictureUrl: 'https://profile.line-scdn.net/picture.jpg',
				email: 'test@example.com',
			};
			const result = strategy.validate('access-token', 'refresh-token', profile);
			expect(result).toEqual({
				lineId: 'U1234567890',
				name: 'テストユーザー',
				email: 'test@example.com',
				picture: 'https://profile.line-scdn.net/picture.jpg',
				accessToken: 'access-token',
			});
		});

		it('email が未提供の場合でも変換できること', () => {
			const profile = {
				id: 'U9999999999',
				displayName: 'No Email User',
				pictureUrl: undefined,
				email: undefined,
			};
			const result = strategy.validate('access-token', 'refresh-token', profile);
			expect(result.lineId).toBe('U9999999999');
			expect(result.email).toBeUndefined();
		});

		it('accessToken を StrategyUser に含めること', () => {
			const profile = { id: 'U111', displayName: 'User', pictureUrl: undefined, email: undefined };
			const result = strategy.validate('my-token', 'refresh', profile);
			expect(result.accessToken).toBe('my-token');
		});

		it('クレデンシャル未設定の場合に ServiceUnavailableException をスローすること', () => {
			const noClientId = {
				...mockConfigService,
				lineClientId: undefined,
			} as unknown as ConfigService;
			const unconfiguredStrategy = new LineStrategy(noClientId);
			expect(() =>
				unconfiguredStrategy.validate('token', 'refresh', { id: 'U1', displayName: 'User' }),
			).toThrow(ServiceUnavailableException);
		});
	});
});
