import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { envValidator } from './env';

const REQUIRED_ENVS = {
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

describe('envValidator', () => {
	beforeEach(() => {
		envValidator.reset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		envValidator.reset();
	});

	describe('既存 env の挙動（regression ガード）', () => {
		it('必須 env を取得できること', () => {
			stubRequiredEnvs();

			const config = envValidator.validate();

			expect(config.backendUrl).toBe('http://localhost:3000');
			expect(config.appUrl).toBe('http://localhost:5173');
			expect(config.supabaseUrl).toBe('https://supabase.example.com');
			expect(config.supabaseAnonKey).toBe('anon-key');
		});

		it('必須 env が欠けると例外を投げること', () => {
			vi.stubEnv('VITE_BACKEND_URL', '');
			vi.stubEnv('VITE_APP_URL', REQUIRED_ENVS.VITE_APP_URL);
			vi.stubEnv('VITE_SUPABASE_URL', REQUIRED_ENVS.VITE_SUPABASE_URL);
			vi.stubEnv('VITE_SUPABASE_ANON_KEY', REQUIRED_ENVS.VITE_SUPABASE_ANON_KEY);

			expect(() => envValidator.validate()).toThrow(/Backend URL/);
		});

		it('OAuth 用 optional env を取得できること', () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');
			vi.stubEnv('VITE_GITHUB_CLIENT_ID', 'github-client');

			const config = envValidator.validate();

			expect(config.googleClientId).toBe('google-client');
			expect(config.githubClientId).toBe('github-client');
		});
	});

	describe('Sentry 関連 env', () => {
		it('Sentry env が未設定なら全プロパティ undefined であること', () => {
			stubRequiredEnvs();

			const config = envValidator.validate();

			expect(config.sentryDsn).toBeUndefined();
			expect(config.sentryEnvironment).toBeUndefined();
			expect(config.sentryRelease).toBeUndefined();
			expect(config.sentryTracesSampleRate).toBeUndefined();
		});

		it('全 Sentry env を読み込めること', () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
			vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');
			vi.stubEnv('VITE_SENTRY_RELEASE', 'sha-123');
			vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0.25');

			const config = envValidator.validate();

			expect(config.sentryDsn).toBe('https://abc@sentry.io/1');
			expect(config.sentryEnvironment).toBe('production');
			expect(config.sentryRelease).toBe('sha-123');
			expect(config.sentryTracesSampleRate).toBe(0.25);
		});

		it('DSN のみ設定で environment 未指定の場合は production に fallback すること', () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');

			const config = envValidator.validate();

			expect(config.sentryEnvironment).toBe('production');
		});

		it('environment が development / production 以外なら例外を投げること', () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
			vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging');

			expect(() => envValidator.validate()).toThrow(/Sentry Environment/);
		});

		it('tracesSampleRate に数値以外が来たら例外を投げること', () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
			vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', 'not-a-number');

			expect(() => envValidator.validate()).toThrow(/Sentry Traces Sample Rate/);
		});

		it('DSN 未設定で environment が来ても fallback は発火しないこと', () => {
			stubRequiredEnvs();
			vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'development');

			const config = envValidator.validate();

			expect(config.sentryDsn).toBeUndefined();
			expect(config.sentryEnvironment).toBe('development');
		});
	});
});
