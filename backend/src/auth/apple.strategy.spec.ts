import { ServiceUnavailableException } from '@nestjs/common';
import { AppleStrategy } from './apple.strategy';
import { ConfigService } from '../config/config.service';

jest.mock('passport-apple', () => ({
	Strategy: class MockAppleStrategy {
		name = 'apple';
		constructor(
			_options: unknown,
			public verify: (
				accessToken: string,
				refreshToken: string,
				idToken: Record<string, unknown>,
				profile: unknown,
				done: (err: unknown, user?: unknown) => void,
			) => void,
		) {}
	},
}));

jest.mock('@nestjs/passport', () => ({
	PassportStrategy: (Strategy: new (...args: unknown[]) => unknown) => Strategy,
}));

describe('AppleStrategy', () => {
	const mockConfigService = {
		appleClientId: 'com.example.mosaku',
		appleTeamId: 'ABCDE12345',
		appleKeyId: 'KEY12345AB',
		applePrivateKey: '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----',
		appleRedirectUri: 'http://localhost:3000/auth/apple/callback',
	} as unknown as ConfigService;

	describe('constructor', () => {
		it('クレデンシャルが設定されている場合に正常に初期化されること', () => {
			expect(() => new AppleStrategy(mockConfigService)).not.toThrow();
		});

		it('appleClientId が未設定の場合にエラーをスローしないこと（警告ログのみ）', () => {
			const noClient = {
				...mockConfigService,
				appleClientId: undefined,
			} as unknown as ConfigService;
			expect(() => new AppleStrategy(noClient)).not.toThrow();
		});

		it('applePrivateKey が未設定の場合にエラーをスローしないこと（警告ログのみ）', () => {
			const noKey = {
				...mockConfigService,
				applePrivateKey: undefined,
			} as unknown as ConfigService;
			expect(() => new AppleStrategy(noKey)).not.toThrow();
		});

		it('クレデンシャル未設定の場合に警告ログを出力すること', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
			const noClient = {
				...mockConfigService,
				appleClientId: undefined,
			} as unknown as ConfigService;
			new AppleStrategy(noClient);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Apple'));
			warnSpy.mockRestore();
		});
	});

	describe('validate()', () => {
		let strategy: AppleStrategy;

		beforeEach(() => {
			strategy = new AppleStrategy(mockConfigService);
		});

		it('初回認証（email あり）の場合に AppleStrategyUser に変換すること', () => {
			const idToken = { sub: '000123.abc456.0000' };
			const result = strategy.validate(
				'access-token',
				'refresh-token',
				idToken,
				{},
				'Taro',
				'Apple',
				'taro@privaterelay.appleid.com',
			);
			expect(result).toEqual({
				appleId: '000123.abc456.0000',
				name: 'Taro Apple',
				email: 'taro@privaterelay.appleid.com',
				accessToken: 'access-token',
			});
		});

		it('2回目以降の認証（email・名前なし）でも変換できること', () => {
			const idToken = { sub: '000123.abc456.0000' };
			const result = strategy.validate(
				'access-token',
				'refresh-token',
				idToken,
				{},
				undefined,
				undefined,
				undefined,
			);
			expect(result.appleId).toBe('000123.abc456.0000');
			expect(result.name).toBe('Apple User');
			expect(result.email).toBeUndefined();
		});

		it('lastName のみの場合でも name を組み立てられること', () => {
			const idToken = { sub: 'sub-id' };
			const result = strategy.validate('t', 'r', idToken, {}, undefined, 'Yamada', undefined);
			expect(result.name).toBe('Yamada');
		});

		it('firstName のみの場合でも name を組み立てられること', () => {
			const idToken = { sub: 'sub-id' };
			const result = strategy.validate('t', 'r', idToken, {}, 'Hanako', undefined, undefined);
			expect(result.name).toBe('Hanako');
		});

		it('クレデンシャル未設定の場合に ServiceUnavailableException をスローすること', () => {
			const noClient = {
				...mockConfigService,
				appleClientId: undefined,
			} as unknown as ConfigService;
			const unconfiguredStrategy = new AppleStrategy(noClient);
			expect(() =>
				unconfiguredStrategy.validate(
					'token',
					'refresh',
					{ sub: 'sub-id' },
					{},
					undefined,
					undefined,
					undefined,
				),
			).toThrow(ServiceUnavailableException);
		});
	});
});
