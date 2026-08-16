import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryInitMock = vi.fn();
const reactRouterV7IntegrationMock = vi.fn(() => ({ name: 'BrowserTracing' }));

vi.mock('@sentry/react', () => ({
	init: (options: unknown) => sentryInitMock(options),
	reactRouterV7BrowserTracingIntegration: (options: unknown) =>
		reactRouterV7IntegrationMock(options),
}));

const REQUIRED_ENVS: Record<string, string> = {
	VITE_BACKEND_URL: 'http://localhost:3000',
	VITE_APP_URL: 'http://localhost:5173',
	VITE_SUPABASE_URL: 'https://supabase.example.com',
	VITE_SUPABASE_ANON_KEY: 'anon-key',
};

function stubRequiredEnvs() {
	for (const [key, value] of Object.entries(REQUIRED_ENVS)) {
		vi.stubEnv(key, value);
	}
}

async function loadInitModule() {
	const { envValidator } = await import('../env');
	envValidator.reset();
	const { initSentry } = await import('./init');
	return { initSentry, envValidator };
}

describe('initSentry', () => {
	beforeEach(() => {
		sentryInitMock.mockReset();
		reactRouterV7IntegrationMock.mockClear();
		reactRouterV7IntegrationMock.mockImplementation(() => ({ name: 'BrowserTracing' }));
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		const { envValidator } = await import('../env');
		envValidator.reset();
		vi.resetModules();
	});

	describe('DSN ガード', () => {
		it('VITE_SENTRY_DSN 未設定なら Sentry.init を呼ばないこと', async () => {
			stubRequiredEnvs();
			const logger = await import('../logger');
			const infoSpy = vi.spyOn(logger.logger, 'info').mockImplementation(() => {});

			const { initSentry } = await loadInitModule();
			initSentry();

			expect(sentryInitMock).not.toHaveBeenCalled();
			expect(infoSpy).toHaveBeenCalledWith('Sentry disabled: VITE_SENTRY_DSN not set');

			infoSpy.mockRestore();
		});
	});

	describe('Production 初期化', () => {
		beforeEach(() => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
			vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');
			vi.stubEnv('VITE_SENTRY_RELEASE', 'sha-123');
		});

		it('Sentry.init を 1 回だけ呼ぶこと', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			expect(sentryInitMock).toHaveBeenCalledTimes(1);
		});

		it('environment / release / sendDefaultPii / sampleRate を正しく設定すること', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			expect(options.dsn).toBe('https://abc@sentry.io/1');
			expect(options.environment).toBe('production');
			expect(options.release).toBe('sha-123');
			expect(options.sendDefaultPii).toBe(false);
			expect(options.sampleRate).toBe(1.0);
		});

		it('VITE_SENTRY_TRACES_SAMPLE_RATE 未指定で production なら 0.1 をデフォルトにすること', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			expect(options.tracesSampleRate).toBe(0.1);
		});

		it('VITE_SENTRY_TRACES_SAMPLE_RATE が指定されたらその値を採用すること', async () => {
			vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0.5');
			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			expect(options.tracesSampleRate).toBe(0.5);
		});

		it('reactRouterV7BrowserTracingIntegration を integrations に組み込むこと', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			expect(reactRouterV7IntegrationMock).toHaveBeenCalledTimes(1);
			const options = sentryInitMock.mock.calls[0][0];
			expect(Array.isArray(options.integrations)).toBe(true);
			expect(options.integrations).toContainEqual(
				expect.objectContaining({ name: 'BrowserTracing' }),
			);
		});

		it('ignoreErrors に AbortError / NetworkError / Failed to fetch / Load failed を含むこと', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			expect(options.ignoreErrors).toEqual(
				expect.arrayContaining(['AbortError', 'NetworkError', 'Failed to fetch', 'Load failed']),
			);
		});

		it('denyUrls に chrome-extension / moz-extension パターンを含むこと', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			const denyUrls = options.denyUrls as ReadonlyArray<RegExp>;
			expect(denyUrls.some((rule) => rule.test('chrome-extension://abc/script.js'))).toBe(true);
			expect(denyUrls.some((rule) => rule.test('moz-extension://abc/script.js'))).toBe(true);
		});

		it('beforeSend が PII を含む event をマスクして返すこと', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			const event = {
				request: { data: { content: 'memo body', title: 'タイトル' } },
				extra: { invitationCode: 'INVITE-XYZ' },
			};

			const result = options.beforeSend(event);

			expect(result.request.data.content).toBe('[REDACTED]');
			expect(result.request.data.title).toBe('タイトル');
			expect(result.extra.invitationCode).toBe('[REDACTED]');
		});

		it('beforeSend が scrubber 例外時に null を返すこと（送信抑止）', async () => {
			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			const cyclic: Record<string, unknown> = {};
			cyclic.self = cyclic;
			Object.defineProperty(cyclic, 'breaking', {
				get() {
					throw new Error('boom');
				},
				enumerable: true,
			});

			const result = options.beforeSend(cyclic);

			expect(result).toBeNull();
		});
	});

	describe('Development 初期化', () => {
		it('environment が development なら tracesSampleRate のデフォルトは 0', async () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
			vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'development');

			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			expect(options.environment).toBe('development');
			expect(options.tracesSampleRate).toBe(0);
		});
	});

	describe('Sentry.init 例外時の振る舞い', () => {
		it('Sentry.init が throw してもアプリ起動を妨げず warn だけ出すこと', async () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
			vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');

			sentryInitMock.mockImplementation(() => {
				throw new Error('init boom');
			});

			const logger = await import('../logger');
			const warnSpy = vi.spyOn(logger.logger, 'warn').mockImplementation(() => {});

			const { initSentry } = await loadInitModule();
			expect(() => initSentry()).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();

			warnSpy.mockRestore();
		});
	});

	describe('release 未設定時の fallback', () => {
		it('VITE_SENTRY_RELEASE が無いと release オプションを省略すること', async () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
			vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');

			const { initSentry } = await loadInitModule();
			initSentry();

			const options = sentryInitMock.mock.calls[0][0];
			expect(options.release).toBeUndefined();
		});
	});
});
