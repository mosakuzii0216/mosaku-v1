import { ConfigService } from './config.service';
import { SENTRY_ENV_KEYS } from '../common/sentry/sentry-env-keys';

describe('ConfigService - Sentry', () => {
	let service: ConfigService;
	const originalEnv = process.env;

	beforeEach(() => {
		service = new ConfigService();
		process.env = { ...originalEnv };
		// Sentry 関連 env をクリーンアップしてから個別テストでセット
		for (const key of Object.values(SENTRY_ENV_KEYS)) {
			delete process.env[key];
		}
		delete process.env.NODE_ENV;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('SENTRY_ENV_KEYS', () => {
		it('Sentry 関連の env キーを定数として export していること', () => {
			expect(SENTRY_ENV_KEYS.DSN).toBe('SENTRY_DSN');
			expect(SENTRY_ENV_KEYS.ENVIRONMENT).toBe('SENTRY_ENVIRONMENT');
			expect(SENTRY_ENV_KEYS.RELEASE).toBe('SENTRY_RELEASE');
			expect(SENTRY_ENV_KEYS.TRACES_SAMPLE_RATE).toBe('SENTRY_TRACES_SAMPLE_RATE');
			expect(SENTRY_ENV_KEYS.PROFILES_SAMPLE_RATE).toBe('SENTRY_PROFILES_SAMPLE_RATE');
			expect(SENTRY_ENV_KEYS.DEBUG_ENABLED).toBe('SENTRY_DEBUG_ENABLED');
		});
	});

	describe('dsn', () => {
		it('SENTRY_DSN が設定されている場合に値を返すこと', () => {
			process.env.SENTRY_DSN = 'https://abc@sentry.io/123';

			expect(service.sentry.dsn).toBe('https://abc@sentry.io/123');
		});

		it('SENTRY_DSN が未設定の場合に undefined を返すこと', () => {
			expect(service.sentry.dsn).toBeUndefined();
		});
	});

	describe('environment', () => {
		it('SENTRY_ENVIRONMENT が production の場合に production を返すこと', () => {
			process.env.SENTRY_ENVIRONMENT = 'production';

			expect(service.sentry.environment).toBe('production');
		});

		it('SENTRY_ENVIRONMENT が development の場合に development を返すこと', () => {
			process.env.SENTRY_ENVIRONMENT = 'development';

			expect(service.sentry.environment).toBe('development');
		});

		it('SENTRY_ENVIRONMENT 未設定で NODE_ENV=production の場合に production を返すこと', () => {
			process.env.NODE_ENV = 'production';

			expect(service.sentry.environment).toBe('production');
		});

		it('SENTRY_ENVIRONMENT 未設定で NODE_ENV != production の場合に development を返すこと', () => {
			process.env.NODE_ENV = 'test';

			expect(service.sentry.environment).toBe('development');
		});

		it('SENTRY_ENVIRONMENT も NODE_ENV も未設定の場合に development を返すこと', () => {
			expect(service.sentry.environment).toBe('development');
		});

		it('SENTRY_ENVIRONMENT が想定外の値の場合に development を返すこと', () => {
			process.env.SENTRY_ENVIRONMENT = 'staging';

			expect(service.sentry.environment).toBe('development');
		});
	});

	describe('debugEnabled', () => {
		it('SENTRY_DEBUG_ENABLED=true のときだけ true を返すこと', () => {
			process.env.SENTRY_DEBUG_ENABLED = 'true';

			expect(service.sentry.debugEnabled).toBe(true);
		});

		it('SENTRY_DEBUG_ENABLED 未設定のときに false を返すこと', () => {
			expect(service.sentry.debugEnabled).toBe(false);
		});

		it('SENTRY_DEBUG_ENABLED が "true" 以外の値のときに false を返すこと', () => {
			process.env.SENTRY_DEBUG_ENABLED = 'false';
			expect(service.sentry.debugEnabled).toBe(false);

			process.env.SENTRY_DEBUG_ENABLED = '1';
			expect(service.sentry.debugEnabled).toBe(false);

			process.env.SENTRY_DEBUG_ENABLED = 'TRUE';
			expect(service.sentry.debugEnabled).toBe(false);
		});
	});

	describe('release', () => {
		it('SENTRY_RELEASE が設定されている場合に値を返すこと', () => {
			process.env.SENTRY_RELEASE = 'abc1234';

			expect(service.sentry.release).toBe('abc1234');
		});

		it('SENTRY_RELEASE が未設定の場合に undefined を返すこと', () => {
			expect(service.sentry.release).toBeUndefined();
		});

		it('SENTRY_RELEASE が空文字の場合に undefined を返すこと', () => {
			process.env.SENTRY_RELEASE = '';

			expect(service.sentry.release).toBeUndefined();
		});
	});

	describe('tracesSampleRate', () => {
		it('SENTRY_TRACES_SAMPLE_RATE が設定されている場合に parseFloat した値を返すこと', () => {
			process.env.SENTRY_TRACES_SAMPLE_RATE = '0.25';

			expect(service.sentry.tracesSampleRate).toBe(0.25);
		});

		it('未設定で production の場合に 0.1 を返すこと', () => {
			process.env.NODE_ENV = 'production';

			expect(service.sentry.tracesSampleRate).toBe(0.1);
		});

		it('未設定で development の場合に 0 を返すこと', () => {
			expect(service.sentry.tracesSampleRate).toBe(0);
		});

		it('数値として解釈できない値の場合に environment 別のデフォルトに fallback すること', () => {
			process.env.SENTRY_TRACES_SAMPLE_RATE = 'not-a-number';
			process.env.NODE_ENV = 'production';

			expect(service.sentry.tracesSampleRate).toBe(0.1);
		});
	});

	describe('profilesSampleRate', () => {
		it('SENTRY_PROFILES_SAMPLE_RATE が設定されている場合に parseFloat した値を返すこと', () => {
			process.env.SENTRY_PROFILES_SAMPLE_RATE = '0.5';

			expect(service.sentry.profilesSampleRate).toBe(0.5);
		});

		it('未設定で production の場合に 0.1 を返すこと', () => {
			process.env.NODE_ENV = 'production';

			expect(service.sentry.profilesSampleRate).toBe(0.1);
		});

		it('未設定で development の場合に 0 を返すこと', () => {
			expect(service.sentry.profilesSampleRate).toBe(0);
		});
	});
});
