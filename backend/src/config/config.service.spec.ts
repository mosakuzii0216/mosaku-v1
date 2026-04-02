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
