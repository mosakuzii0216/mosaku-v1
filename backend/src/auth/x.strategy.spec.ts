import { ServiceUnavailableException } from '@nestjs/common';
import { XStrategy } from './x.strategy';
import { ConfigService } from '../config/config.service';

jest.mock('passport-oauth2', () => ({
	Strategy: class MockOAuth2Strategy {
		name = 'oauth2';
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

describe('XStrategy', () => {
	const mockConfigService = {
		xClientId: 'x-client-id',
		xClientSecret: 'x-client-secret',
		xRedirectUri: 'http://localhost:3000/auth/x/callback',
	} as unknown as ConfigService;

	describe('constructor', () => {
		it('クレデンシャルが設定されている場合に正常に初期化されること', () => {
			expect(() => new XStrategy(mockConfigService)).not.toThrow();
		});

		it('xClientId が未設定の場合にエラーをスローしないこと（警告ログのみ）', () => {
			const noId = { ...mockConfigService, xClientId: undefined } as unknown as ConfigService;
			expect(() => new XStrategy(noId)).not.toThrow();
		});

		it('xClientSecret が未設定の場合にエラーをスローしないこと（警告ログのみ）', () => {
			const noSecret = {
				...mockConfigService,
				xClientSecret: undefined,
			} as unknown as ConfigService;
			expect(() => new XStrategy(noSecret)).not.toThrow();
		});

		it('クレデンシャル未設定の場合に警告ログを出力すること', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
			const noId = { ...mockConfigService, xClientId: undefined } as unknown as ConfigService;
			new XStrategy(noId);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('X'));
			warnSpy.mockRestore();
		});
	});

	describe('validate()', () => {
		let strategy: XStrategy;

		beforeEach(() => {
			strategy = new XStrategy(mockConfigService);
		});

		it('X プロフィールを XStrategyUser に変換すること', () => {
			const profile = {
				data: {
					id: '1234567890',
					name: 'X User',
					username: 'xuser123',
					profile_image_url: 'https://pbs.twimg.com/photo.jpg',
				},
			};
			const result = strategy.validate('access-token', 'refresh-token', profile);
			expect(result).toEqual({
				xId: '1234567890',
				name: 'X User',
				username: 'xuser123',
				email: undefined,
				picture: 'https://pbs.twimg.com/photo.jpg',
				accessToken: 'access-token',
			});
		});

		it('username が未提供の場合でも変換できること', () => {
			const profile = { data: { id: '111', name: 'No Username User', username: undefined } };
			const result = strategy.validate('t', 'r', profile);
			expect(result.username).toBeUndefined();
		});

		it('name が未提供の場合に xId をフォールバックとして使用すること', () => {
			const profile = { data: { id: '9999', name: undefined, username: 'someuser' } };
			const result = strategy.validate('t', 'r', profile);
			expect(result.name).toBe('someuser');
		});

		it('クレデンシャル未設定の場合に ServiceUnavailableException をスローすること', () => {
			const noId = { ...mockConfigService, xClientId: undefined } as unknown as ConfigService;
			const unconfiguredStrategy = new XStrategy(noId);
			expect(() =>
				unconfiguredStrategy.validate('token', 'refresh', { data: { id: '1', name: 'User' } }),
			).toThrow(ServiceUnavailableException);
		});
	});
});
