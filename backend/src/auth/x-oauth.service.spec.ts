import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config/config.service';
import { XOAuthService } from './x-oauth.service';

describe('XOAuthService', () => {
	const BASE_CONFIG = {
		xClientId: 'test-client-id',
		xClientSecret: 'test-client-secret',
		xRedirectUri: 'http://localhost:3000/auth/x/callback',
	};

	let fetchSpy: jest.SpyInstance;

	beforeEach(() => {
		fetchSpy = jest.spyOn(global, 'fetch');
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	async function buildService(
		config: Partial<typeof BASE_CONFIG> = BASE_CONFIG,
	): Promise<XOAuthService> {
		const module: TestingModule = await Test.createTestingModule({
			providers: [XOAuthService, { provide: ConfigService, useValue: config }],
		}).compile();
		return module.get<XOAuthService>(XOAuthService);
	}

	// ─── isConfigured ──────────────────────────────────────────────────────

	describe('isConfigured', () => {
		it('client id・secret が揃っていれば true を返す', async () => {
			const svc = await buildService();
			expect(svc.isConfigured()).toBe(true);
		});

		it('xClientId が未設定なら false を返す', async () => {
			const svc = await buildService({ ...BASE_CONFIG, xClientId: undefined });
			expect(svc.isConfigured()).toBe(false);
		});

		it('xClientSecret が未設定なら false を返す', async () => {
			const svc = await buildService({ ...BASE_CONFIG, xClientSecret: undefined });
			expect(svc.isConfigured()).toBe(false);
		});
	});

	// ─── exchangeCodeForUser ────────────────────────────────────────────────

	describe('exchangeCodeForUser', () => {
		it('token 交換 → profile 取得 → XStrategyUser へマッピングできること', async () => {
			const svc = await buildService();
			fetchSpy
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ access_token: 'access-tok-123' }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						data: {
							id: 'x-id-001',
							name: 'Test User',
							username: 'testuser',
							profile_image_url: 'https://example.com/pic.jpg',
						},
					}),
				});

			const result = await svc.exchangeCodeForUser({
				code: 'auth-code',
				verifier: 'pkce-verifier',
			});

			expect(result.xId).toBe('x-id-001');
			expect(result.name).toBe('Test User');
			expect(result.username).toBe('testuser');
			expect(result.picture).toBe('https://example.com/pic.jpg');
			expect(result.accessToken).toBe('access-tok-123');
			expect(result.email).toBeUndefined();
		});

		it('name がない場合は username を name として使うこと', async () => {
			const svc = await buildService();
			fetchSpy
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ access_token: 'tok' }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ data: { id: 'x-id-002', username: 'user2' } }),
				});

			const result = await svc.exchangeCodeForUser({ code: 'c', verifier: 'v' });
			expect(result.name).toBe('user2');
		});

		it('token 交換が 4xx を返した場合は throw すること', async () => {
			const svc = await buildService();
			fetchSpy.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: 'Bad Request',
			});

			await expect(svc.exchangeCodeForUser({ code: 'c', verifier: 'v' })).rejects.toThrow();
		});

		it('profile 取得が 4xx を返した場合は throw すること', async () => {
			const svc = await buildService();
			fetchSpy
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ access_token: 'tok' }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 401,
					statusText: 'Unauthorized',
				});

			await expect(svc.exchangeCodeForUser({ code: 'c', verifier: 'v' })).rejects.toThrow();
		});

		it('profile の data.id が欠落している場合は throw すること', async () => {
			const svc = await buildService();
			fetchSpy
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ access_token: 'tok' }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ data: { name: 'No ID User' } }),
				});

			await expect(svc.exchangeCodeForUser({ code: 'c', verifier: 'v' })).rejects.toThrow();
		});
	});
});
