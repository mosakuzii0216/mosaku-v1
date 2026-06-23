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

	// ─── Session Cookie 設定（OAuth セッション永続化）─────────────────────────

	describe('sessionCookieOptions', () => {
		it('開発既定では sameSite=lax, secure=false, httpOnly=true, maxAge=10分 を返すこと', () => {
			process.env.NODE_ENV = 'development';
			delete process.env.SESSION_COOKIE_SAMESITE;
			delete process.env.SESSION_COOKIE_SECURE;
			delete process.env.SESSION_COOKIE_MAXAGE;
			const opts = service.sessionCookieOptions;
			expect(opts.sameSite).toBe('lax');
			expect(opts.secure).toBe(false);
			expect(opts.httpOnly).toBe(true);
			expect(opts.maxAge).toBe(1000 * 60 * 10);
		});

		it('本番既定では secure=true, httpOnly=true を返すこと', () => {
			process.env.NODE_ENV = 'production';
			delete process.env.SESSION_COOKIE_SAMESITE;
			delete process.env.SESSION_COOKIE_SECURE;
			delete process.env.SESSION_COOKIE_MAXAGE;
			const opts = service.sessionCookieOptions;
			expect(opts.secure).toBe(true);
			expect(opts.httpOnly).toBe(true);
			expect(opts.sameSite).toBe('lax');
		});

		it('SESSION_COOKIE_SAMESITE で値を上書きできること', () => {
			process.env.SESSION_COOKIE_SAMESITE = 'none';
			expect(service.sessionCookieOptions.sameSite).toBe('none');
			process.env.SESSION_COOKIE_SAMESITE = 'strict';
			expect(service.sessionCookieOptions.sameSite).toBe('strict');
		});

		it('SESSION_COOKIE_SAMESITE に不正値が来たら lax にフォールバックすること', () => {
			process.env.SESSION_COOKIE_SAMESITE = 'invalid';
			expect(service.sessionCookieOptions.sameSite).toBe('lax');
		});

		it('SESSION_COOKIE_SECURE で値を強制上書きできること', () => {
			process.env.NODE_ENV = 'production';
			process.env.SESSION_COOKIE_SECURE = 'false';
			expect(service.sessionCookieOptions.secure).toBe(false);

			process.env.NODE_ENV = 'development';
			process.env.SESSION_COOKIE_SECURE = 'true';
			expect(service.sessionCookieOptions.secure).toBe(true);
		});

		it('SESSION_COOKIE_MAXAGE で有効期間（ms）を上書きできること', () => {
			process.env.SESSION_COOKIE_MAXAGE = '300000';
			expect(service.sessionCookieOptions.maxAge).toBe(300000);
		});

		it('SESSION_COOKIE_MAXAGE に不正値が来たら既定（10分）にフォールバックすること', () => {
			process.env.SESSION_COOKIE_MAXAGE = 'not-a-number';
			expect(service.sessionCookieOptions.maxAge).toBe(1000 * 60 * 10);
			process.env.SESSION_COOKIE_MAXAGE = '0';
			expect(service.sessionCookieOptions.maxAge).toBe(1000 * 60 * 10);
		});
	});

	// ─── Invitation State Secret ─────────────────────────────────────────────

	describe('invitationStateSecret', () => {
		it('INVITATION_STATE_SECRET が設定されていれば値を返すこと', () => {
			process.env.INVITATION_STATE_SECRET = 'invitation-state-secret-32-bytes-min';
			expect(service.invitationStateSecret).toBe('invitation-state-secret-32-bytes-min');
		});

		it('INVITATION_STATE_SECRET が未設定の場合は環境を問わず fail-fast で例外を投げること', () => {
			process.env.NODE_ENV = 'production';
			delete process.env.INVITATION_STATE_SECRET;
			expect(() => service.invitationStateSecret).toThrow(/INVITATION_STATE_SECRET/);

			process.env.NODE_ENV = 'development';
			delete process.env.INVITATION_STATE_SECRET;
			expect(() => service.invitationStateSecret).toThrow(/INVITATION_STATE_SECRET/);
		});

		it('JWT_SECRET とは独立した getter を介して取得されること（同値でも参照を分離）', () => {
			process.env.JWT_SECRET = 'shared-value';
			process.env.INVITATION_STATE_SECRET = 'shared-value';

			const jwtSecret = service.jwtSecret;
			const stateSecret = service.invitationStateSecret;

			expect(jwtSecret).toBe('shared-value');
			expect(stateSecret).toBe('shared-value');

			delete process.env.INVITATION_STATE_SECRET;
			expect(() => service.invitationStateSecret).toThrow(/INVITATION_STATE_SECRET/);
			expect(service.jwtSecret).toBe('shared-value');
		});
	});

	// ─── パスワードリセット・メール設定 ────────────────────────────────────

	describe('resendApiKey', () => {
		it('RESEND_API_KEY が設定されている場合に値を返すこと', () => {
			process.env.RESEND_API_KEY = 're_test_key_123';
			expect(service.resendApiKey).toBe('re_test_key_123');
		});

		it('RESEND_API_KEY が未設定の場合に undefined を返すこと', () => {
			delete process.env.RESEND_API_KEY;
			expect(service.resendApiKey).toBeUndefined();
		});
	});

	describe('mailFrom', () => {
		it('MAIL_FROM が設定されている場合に値を返すこと', () => {
			process.env.MAIL_FROM = 'noreply@mosaku.jp';
			expect(service.mailFrom).toBe('noreply@mosaku.jp');
		});

		it('MAIL_FROM が未設定の場合にデフォルト値 onboarding@resend.dev を返すこと', () => {
			delete process.env.MAIL_FROM;
			expect(service.mailFrom).toBe('onboarding@resend.dev');
		});
	});

	describe('passwordResetUrlBase', () => {
		it('PASSWORD_RESET_URL_BASE が設定されている場合にその値を返すこと', () => {
			process.env.PASSWORD_RESET_URL_BASE = 'https://mosaku.jp/auth/reset-password/confirm';
			expect(service.passwordResetUrlBase).toBe('https://mosaku.jp/auth/reset-password/confirm');
		});

		it('PASSWORD_RESET_URL_BASE が未設定の場合に frontendUrl からパスを導出すること', () => {
			delete process.env.PASSWORD_RESET_URL_BASE;
			process.env.FRONTEND_URL = 'https://mosaku.jp';
			expect(service.passwordResetUrlBase).toBe('https://mosaku.jp/auth/reset-password/confirm');
		});

		it('PASSWORD_RESET_URL_BASE が未設定で FRONTEND_URL も未設定の場合にデフォルト導出すること', () => {
			delete process.env.PASSWORD_RESET_URL_BASE;
			delete process.env.FRONTEND_URL;
			expect(service.passwordResetUrlBase).toBe('http://localhost/auth/reset-password/confirm');
		});
	});

	// ─── OAUTH_STATE_ENC_KEY ──────────────────────────────────────────────
	describe('oauthStateEncKey', () => {
		it('OAUTH_STATE_ENC_KEY が有効な hex 64 字なら Buffer(32byte) を返すこと', () => {
			process.env.OAUTH_STATE_ENC_KEY = 'a'.repeat(64);
			const key = service.oauthStateEncKey;
			expect(key).toBeInstanceOf(Buffer);
			expect(key.length).toBe(32);
		});

		it('OAUTH_STATE_ENC_KEY が未設定の場合は fail-fast で例外を投げること', () => {
			delete process.env.OAUTH_STATE_ENC_KEY;
			expect(() => service.oauthStateEncKey).toThrow(/OAUTH_STATE_ENC_KEY/);
		});

		it('OAUTH_STATE_ENC_KEY が 64 字未満の場合は fail-fast で例外を投げること', () => {
			process.env.OAUTH_STATE_ENC_KEY = 'a'.repeat(32);
			expect(() => service.oauthStateEncKey).toThrow(/OAUTH_STATE_ENC_KEY/);
		});

		it('OAUTH_STATE_ENC_KEY が 64 字超の場合は fail-fast で例外を投げること', () => {
			process.env.OAUTH_STATE_ENC_KEY = 'a'.repeat(66);
			expect(() => service.oauthStateEncKey).toThrow(/OAUTH_STATE_ENC_KEY/);
		});

		it('INVITATION_STATE_SECRET とは独立した getter を介して取得されること（鍵分離）', () => {
			process.env.OAUTH_STATE_ENC_KEY = 'b'.repeat(64);
			process.env.INVITATION_STATE_SECRET = 'other-secret';
			const encKey = service.oauthStateEncKey;
			const hmacKey = service.invitationStateSecret;
			expect(encKey).toBeInstanceOf(Buffer);
			expect(hmacKey).toBe('other-secret');
		});
	});

	// ─── generateOAuthAuthorizationUrl - X case ───────────────────────────
	describe('generateOAuthAuthorizationUrl - X case', () => {
		beforeEach(() => {
			process.env.X_CLIENT_ID = 'x-client-id';
			process.env.X_REDIRECT_URI = 'https://example.com/auth/x/callback';
		});

		it("'x' を渡すと code_challenge と code_challenge_method=S256 が載ること", () => {
			const url = service.generateOAuthAuthorizationUrl('x', 'some.state', 'challenge_abc');
			expect(url).toContain('code_challenge=challenge_abc');
			expect(url).toContain('code_challenge_method=S256');
		});

		it("'x' URL に response_type=code, scope=tweet.read が含まれること", () => {
			const url = service.generateOAuthAuthorizationUrl('x', 'some.state', 'challenge_xyz');
			expect(url).toContain('response_type=code');
			expect(url).toContain('tweet.read');
		});

		it("'x' URL に state が含まれること", () => {
			const url = service.generateOAuthAuthorizationUrl('x', 'my.state', 'challenge_xyz');
			expect(url).toContain('state=my.state');
		});

		it("codeChallenge なしで 'x' を渡すと例外を投げること", () => {
			expect(() => service.generateOAuthAuthorizationUrl('x', 'some.state')).toThrow();
		});
	});

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

	// ─── Task 4.4: 本番クロスオリジン構成の整合性検証 ────────────────────────
	// R6.2: 本番のクロスオリジン構成（mosaku.jp ↔ api.mosaku.jp）で
	// X を含む全プロバイダのリダイレクトが成立する状態を維持する

	describe('Task 4.4: 5 社 redirect_uri パスとコールバックルートの整合性', () => {
		const PROD_BACKEND = 'https://api.mosaku.jp';

		const PROVIDER_CALLBACK_PATHS: Record<string, string> = {
			google: '/auth/google/callback',
			github: '/auth/github/callback',
			line: '/auth/line/callback',
			apple: '/auth/apple/callback',
			x: '/auth/x/callback',
		};

		beforeEach(() => {
			// 本番相当のクロスオリジン構成
			process.env.GOOGLE_REDIRECT_URI = `${PROD_BACKEND}/auth/google/callback`;
			process.env.GITHUB_REDIRECT_URI = `${PROD_BACKEND}/auth/github/callback`;
			process.env.LINE_REDIRECT_URI = `${PROD_BACKEND}/auth/line/callback`;
			process.env.APPLE_REDIRECT_URI = `${PROD_BACKEND}/auth/apple/callback`;
			process.env.X_REDIRECT_URI = `${PROD_BACKEND}/auth/x/callback`;
			process.env.X_CLIENT_ID = 'prod-x-client-id';
			process.env.OAUTH_STATE_ENC_KEY = 'a'.repeat(64);
			process.env.INVITATION_STATE_SECRET = 'prod-hmac-secret';
		});

		it('X_REDIRECT_URI のパスが /auth/x/callback と一致すること（R6.2）', () => {
			const path = new URL(service.xRedirectUri).pathname;
			expect(path).toBe(PROVIDER_CALLBACK_PATHS['x']);
		});

		it('X 認可 URL の redirect_uri が X_REDIRECT_URI と完全一致すること', () => {
			const url = service.generateOAuthAuthorizationUrl('x', 'signed.state', 'challenge_s256');
			const params = new URLSearchParams(new URL(url).search);
			expect(params.get('redirect_uri')).toBe(`${PROD_BACKEND}/auth/x/callback`);
		});

		it('5 社全ての redirect_uri パスが対応するコールバックルートと一致すること', () => {
			expect(new URL(service.googleRedirectUri).pathname).toBe(PROVIDER_CALLBACK_PATHS['google']);
			expect(new URL(service.githubRedirectUri).pathname).toBe(PROVIDER_CALLBACK_PATHS['github']);
			expect(new URL(service.lineRedirectUri).pathname).toBe(PROVIDER_CALLBACK_PATHS['line']);
			expect(new URL(service.appleRedirectUri).pathname).toBe(PROVIDER_CALLBACK_PATHS['apple']);
			expect(new URL(service.xRedirectUri).pathname).toBe(PROVIDER_CALLBACK_PATHS['x']);
		});

		it('本番クロスオリジン構成: 5 社全ての redirect_uri が api.mosaku.jp を向くこと', () => {
			const uris = [
				service.googleRedirectUri,
				service.githubRedirectUri,
				service.lineRedirectUri,
				service.appleRedirectUri,
				service.xRedirectUri,
			];
			for (const uri of uris) {
				expect(new URL(uri).hostname).toBe('api.mosaku.jp');
			}
		});
	});
});
