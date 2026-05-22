import { ConfigService } from './config.service';

describe('ConfigService - LINE/Apple/X OAuth', () => {
	let service: ConfigService;
	const originalEnv = process.env;

	beforeEach(() => {
		service = new ConfigService();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	// ─── LINE ───────────────────────────────────────────────────────────────

	describe('LINE クレデンシャル', () => {
		it('LINE_CLIENT_ID が設定されている場合に値を返すこと', () => {
			process.env.LINE_CLIENT_ID = 'line-client-id-123';
			expect(service.lineClientId).toBe('line-client-id-123');
		});

		it('LINE_CLIENT_ID が未設定の場合に undefined を返すこと', () => {
			delete process.env.LINE_CLIENT_ID;
			expect(service.lineClientId).toBeUndefined();
		});

		it('LINE_CLIENT_SECRET が設定されている場合に値を返すこと', () => {
			process.env.LINE_CLIENT_SECRET = 'line-client-secret-abc';
			expect(service.lineClientSecret).toBe('line-client-secret-abc');
		});

		it('LINE_CLIENT_SECRET が未設定の場合に undefined を返すこと', () => {
			delete process.env.LINE_CLIENT_SECRET;
			expect(service.lineClientSecret).toBeUndefined();
		});

		it('LINE_REDIRECT_URI が設定されている場合にその値を返すこと', () => {
			process.env.LINE_REDIRECT_URI = 'https://example.com/auth/line/callback';
			expect(service.lineRedirectUri).toBe('https://example.com/auth/line/callback');
		});

		it('LINE_REDIRECT_URI が未設定の場合にデフォルト値を返すこと', () => {
			delete process.env.LINE_REDIRECT_URI;
			expect(service.lineRedirectUri).toBe('http://localhost:3000/auth/line/callback');
		});
	});

	// ─── Apple ──────────────────────────────────────────────────────────────

	describe('Apple クレデンシャル', () => {
		it('APPLE_CLIENT_ID が設定されている場合に値を返すこと', () => {
			process.env.APPLE_CLIENT_ID = 'com.example.mosaku';
			expect(service.appleClientId).toBe('com.example.mosaku');
		});

		it('APPLE_CLIENT_ID が未設定の場合に undefined を返すこと', () => {
			delete process.env.APPLE_CLIENT_ID;
			expect(service.appleClientId).toBeUndefined();
		});

		it('APPLE_TEAM_ID が設定されている場合に値を返すこと', () => {
			process.env.APPLE_TEAM_ID = 'ABCDE12345';
			expect(service.appleTeamId).toBe('ABCDE12345');
		});

		it('APPLE_KEY_ID が設定されている場合に値を返すこと', () => {
			process.env.APPLE_KEY_ID = 'KEY12345AB';
			expect(service.appleKeyId).toBe('KEY12345AB');
		});

		it('APPLE_PRIVATE_KEY が設定されている場合に値を返すこと', () => {
			process.env.APPLE_PRIVATE_KEY =
				'-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----';
			expect(service.applePrivateKey).toContain('BEGIN PRIVATE KEY');
		});

		it('APPLE_PRIVATE_KEY の \\\\n が実際の改行に変換されること', () => {
			process.env.APPLE_PRIVATE_KEY =
				'-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----';
			const key = service.applePrivateKey;
			expect(key).not.toContain('\\n');
			expect(key).toContain('\n');
		});

		it('APPLE_PRIVATE_KEY が未設定の場合に undefined を返すこと', () => {
			delete process.env.APPLE_PRIVATE_KEY;
			expect(service.applePrivateKey).toBeUndefined();
		});

		it('APPLE_REDIRECT_URI が未設定の場合にデフォルト値を返すこと', () => {
			delete process.env.APPLE_REDIRECT_URI;
			expect(service.appleRedirectUri).toBe('http://localhost:3000/auth/apple/callback');
		});

		it('APPLE_REDIRECT_URI が設定されている場合にその値を返すこと', () => {
			process.env.APPLE_REDIRECT_URI = 'https://example.com/auth/apple/callback';
			expect(service.appleRedirectUri).toBe('https://example.com/auth/apple/callback');
		});
	});

	// ─── Refresh Token ─────────────────────────────────────────────────────

	describe('Refresh Token 設定', () => {
		describe('refreshTokenPepper', () => {
			it('REFRESH_TOKEN_PEPPER が設定されていれば値を返すこと', () => {
				process.env.REFRESH_TOKEN_PEPPER = 'super-secret-pepper-32-bytes-min';
				expect(service.refreshTokenPepper).toBe('super-secret-pepper-32-bytes-min');
			});

			it('本番環境で REFRESH_TOKEN_PEPPER が未設定なら fail-fast で例外を投げること', () => {
				process.env.NODE_ENV = 'production';
				delete process.env.REFRESH_TOKEN_PEPPER;
				expect(() => service.refreshTokenPepper).toThrow(/REFRESH_TOKEN_PEPPER/);
			});

			it('開発環境で REFRESH_TOKEN_PEPPER が未設定でも例外を投げないこと', () => {
				process.env.NODE_ENV = 'development';
				delete process.env.REFRESH_TOKEN_PEPPER;
				expect(() => service.refreshTokenPepper).not.toThrow();
			});
		});

		describe('refreshCookieOptions', () => {
			it('既定では SameSite=lax, secure=false, path=/auth, domain=undefined を返すこと（開発）', () => {
				process.env.NODE_ENV = 'development';
				delete process.env.REFRESH_COOKIE_SAMESITE;
				delete process.env.REFRESH_COOKIE_SECURE;
				delete process.env.REFRESH_COOKIE_DOMAIN;
				const opts = service.refreshCookieOptions;
				expect(opts.sameSite).toBe('lax');
				expect(opts.secure).toBe(false);
				expect(opts.path).toBe('/auth');
				expect(opts.domain).toBeUndefined();
			});

			it('本番既定では secure=true, sameSite=lax を返すこと', () => {
				process.env.NODE_ENV = 'production';
				delete process.env.REFRESH_COOKIE_SAMESITE;
				delete process.env.REFRESH_COOKIE_SECURE;
				delete process.env.REFRESH_COOKIE_DOMAIN;
				const opts = service.refreshCookieOptions;
				expect(opts.secure).toBe(true);
				expect(opts.sameSite).toBe('lax');
			});

			it('REFRESH_COOKIE_SAMESITE で値を上書きできること', () => {
				process.env.REFRESH_COOKIE_SAMESITE = 'none';
				expect(service.refreshCookieOptions.sameSite).toBe('none');
				process.env.REFRESH_COOKIE_SAMESITE = 'strict';
				expect(service.refreshCookieOptions.sameSite).toBe('strict');
			});

			it('REFRESH_COOKIE_SAMESITE に不正値が来たら lax にフォールバックすること', () => {
				process.env.REFRESH_COOKIE_SAMESITE = 'invalid';
				expect(service.refreshCookieOptions.sameSite).toBe('lax');
			});

			it('REFRESH_COOKIE_SECURE で値を強制上書きできること', () => {
				process.env.NODE_ENV = 'production';
				process.env.REFRESH_COOKIE_SECURE = 'false';
				expect(service.refreshCookieOptions.secure).toBe(false);

				process.env.NODE_ENV = 'development';
				process.env.REFRESH_COOKIE_SECURE = 'true';
				expect(service.refreshCookieOptions.secure).toBe(true);
			});

			it('REFRESH_COOKIE_DOMAIN を設定すれば domain に反映されること', () => {
				process.env.REFRESH_COOKIE_DOMAIN = '.mosaku.jp';
				expect(service.refreshCookieOptions.domain).toBe('.mosaku.jp');
			});
		});
	});

	// ─── X ──────────────────────────────────────────────────────────────────

	describe('X クレデンシャル', () => {
		it('X_CLIENT_ID が設定されている場合に値を返すこと', () => {
			process.env.X_CLIENT_ID = 'x-client-id-xyz';
			expect(service.xClientId).toBe('x-client-id-xyz');
		});

		it('X_CLIENT_ID が未設定の場合に undefined を返すこと', () => {
			delete process.env.X_CLIENT_ID;
			expect(service.xClientId).toBeUndefined();
		});

		it('X_CLIENT_SECRET が設定されている場合に値を返すこと', () => {
			process.env.X_CLIENT_SECRET = 'x-client-secret-xyz';
			expect(service.xClientSecret).toBe('x-client-secret-xyz');
		});

		it('X_CLIENT_SECRET が未設定の場合に undefined を返すこと', () => {
			delete process.env.X_CLIENT_SECRET;
			expect(service.xClientSecret).toBeUndefined();
		});

		it('X_REDIRECT_URI が未設定の場合にデフォルト値を返すこと', () => {
			delete process.env.X_REDIRECT_URI;
			expect(service.xRedirectUri).toBe('http://localhost:3000/auth/x/callback');
		});

		it('X_REDIRECT_URI が設定されている場合にその値を返すこと', () => {
			process.env.X_REDIRECT_URI = 'https://example.com/auth/x/callback';
			expect(service.xRedirectUri).toBe('https://example.com/auth/x/callback');
		});
	});
});
