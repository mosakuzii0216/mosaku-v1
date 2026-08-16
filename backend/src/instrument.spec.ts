/**
 * `initializeSentry` の動作検証。
 *
 * - DSN 未設定時は init をスキップし 1 行ログだけ出す
 * - DSN 設定時は sendDefaultPii: false / environment / sampleRate: 1.0 を必ず設定する
 * - SENTRY_RELEASE 未設定時は release を omit、設定時は反映する
 * - サンプリング率は env から parseFloat、production 既定 0.1 / development 既定 0
 * - beforeSend で scrubber 結果と applyStandardTags の戻り値が event に統合される
 * - ignoreErrors に 429 非該当の 4xx クラス名が登録され ThrottlerException は除外しない
 * - Sentry.init が throw してもアプリ起動は継続する（warn のみ）
 */

type SentryInitOptions = {
	dsn?: string;
	environment?: string;
	release?: string;
	sampleRate?: number;
	tracesSampleRate?: number;
	profilesSampleRate?: number;
	sendDefaultPii?: boolean;
	integrations?: unknown[];
	ignoreErrors?: string[];
	beforeSend?: (event: Record<string, unknown>, hint?: unknown) => Record<string, unknown> | null;
};

const initMock = jest.fn<void, [SentryInitOptions]>();
const profilingIntegrationMock = jest.fn<{ name: string }, []>(() => ({
	name: 'ProfilingIntegrationMock',
}));

jest.mock('@sentry/nestjs', () => ({
	__esModule: true,
	init: (options: SentryInitOptions): void => initMock(options),
	getCurrentScope: () => ({ setUser: jest.fn(), setTag: jest.fn() }),
}));

jest.mock('@sentry/profiling-node', () => ({
	__esModule: true,
	nodeProfilingIntegration: () => profilingIntegrationMock(),
}));

const SENTRY_ENV_VARS = [
	'SENTRY_DSN',
	'SENTRY_ENVIRONMENT',
	'SENTRY_RELEASE',
	'SENTRY_TRACES_SAMPLE_RATE',
	'SENTRY_PROFILES_SAMPLE_RATE',
	'NODE_ENV',
] as const;

describe('initializeSentry', () => {
	let consoleLogSpy: jest.SpyInstance;
	let consoleWarnSpy: jest.SpyInstance;
	let originalEnv: Partial<Record<(typeof SENTRY_ENV_VARS)[number], string | undefined>>;

	const loadInstrument = (): void => {
		jest.isolateModules(() => {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			require('./instrument');
		});
	};

	const lastInitOptions = (): SentryInitOptions => {
		expect(initMock).toHaveBeenCalled();
		return initMock.mock.calls[initMock.mock.calls.length - 1][0];
	};

	beforeEach(() => {
		initMock.mockReset();
		profilingIntegrationMock.mockClear();
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
		consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

		originalEnv = {};
		for (const key of SENTRY_ENV_VARS) {
			originalEnv[key] = process.env[key];
			delete process.env[key];
		}
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		for (const key of SENTRY_ENV_VARS) {
			const value = originalEnv[key];
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	it('DSN 未設定時に Sentry.init を呼ばず、stdout に "Sentry disabled: SENTRY_DSN not set" を 1 行出力すること', () => {
		loadInstrument();

		expect(initMock).not.toHaveBeenCalled();
		expect(consoleLogSpy).toHaveBeenCalledWith('Sentry disabled: SENTRY_DSN not set');
		expect(consoleLogSpy).toHaveBeenCalledTimes(1);
	});

	it('DSN 設定時に Sentry.init が sendDefaultPii: false / sampleRate: 1.0 を含めて呼ばれること', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

		loadInstrument();

		const options = lastInitOptions();
		expect(options.dsn).toBe('https://public@example.ingest.sentry.io/1');
		expect(options.sendDefaultPii).toBe(false);
		expect(options.sampleRate).toBe(1.0);
		expect(options.integrations).toContainEqual({ name: 'ProfilingIntegrationMock' });
	});

	it('SENTRY_ENVIRONMENT を反映し、production 既定でサンプリング率 0.1 を設定すること', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
		process.env.SENTRY_ENVIRONMENT = 'production';

		loadInstrument();

		const options = lastInitOptions();
		expect(options.environment).toBe('production');
		expect(options.tracesSampleRate).toBeCloseTo(0.1);
		expect(options.profilesSampleRate).toBeCloseTo(0.1);
	});

	it('SENTRY_ENVIRONMENT 未指定 + NODE_ENV !== production 時は environment: development かつサンプリング率 0', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
		process.env.NODE_ENV = 'test';

		loadInstrument();

		const options = lastInitOptions();
		expect(options.environment).toBe('development');
		expect(options.tracesSampleRate).toBe(0);
		expect(options.profilesSampleRate).toBe(0);
	});

	it('SENTRY_TRACES_SAMPLE_RATE / SENTRY_PROFILES_SAMPLE_RATE で env からサンプリング率を上書きできること', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
		process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';
		process.env.SENTRY_PROFILES_SAMPLE_RATE = '0.25';

		loadInstrument();

		const options = lastInitOptions();
		expect(options.tracesSampleRate).toBe(0.5);
		expect(options.profilesSampleRate).toBe(0.25);
	});

	it('SENTRY_RELEASE 未設定時は release を options に含めないこと', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

		loadInstrument();

		const options = lastInitOptions();
		expect(options.release).toBeUndefined();
		expect(Object.prototype.hasOwnProperty.call(options, 'release')).toBe(false);
	});

	it('SENTRY_RELEASE 設定時は release を反映すること', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
		process.env.SENTRY_RELEASE = 'abc1234';

		loadInstrument();

		const options = lastInitOptions();
		expect(options.release).toBe('abc1234');
	});

	it('beforeSend が scrubber と構造化タグを合成して event を返すこと', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

		loadInstrument();

		const options = lastInitOptions();
		expect(typeof options.beforeSend).toBe('function');

		const event = {
			message: 'oops',
			request: {
				url: 'https://api.example.com/memos/abc',
				data: { content: 'super secret memo body' },
			},
			contexts: { response: { status_code: 500 } },
			transaction: 'MemoController.createMemo',
			tags: { existing: 'keep-me' },
		};

		type ProcessedEvent = {
			request: { data: { content: string } };
			tags: {
				existing: string;
				feature_area: string;
				user_facing: boolean;
				controller: string;
				handler: string;
				route: string;
			};
		};
		const result = options.beforeSend!(event, {}) as ProcessedEvent | null;

		expect(result).not.toBeNull();
		expect(result!.request.data.content).toBe('[REDACTED]');
		expect(result!.tags.existing).toBe('keep-me');
		expect(result!.tags.feature_area).toBe('memo');
		expect(result!.tags.user_facing).toBe(true);
		expect(result!.tags.controller).toBe('MemoController');
		expect(result!.tags.handler).toBe('createMemo');
		expect(result!.tags.route).toBe('/memos/abc');
	});

	it('beforeSend が内部例外を握りつぶして null を返し、送信を抑止すること', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

		loadInstrument();

		const options = lastInitOptions();
		const cyclic: { request: { self?: unknown }; tags?: unknown } = { request: {} };
		cyclic.request.self = cyclic;
		// Object.entries は循環でも動くが、tags 合成側で意図的に throw する setter を仕掛ける
		Object.defineProperty(cyclic, 'tags', {
			get() {
				throw new Error('boom');
			},
			enumerable: true,
		});

		const result = options.beforeSend!(cyclic, {});
		expect(result).toBeNull();
	});

	it('ignoreErrors に 429 非該当の 4xx クラス名（NotFoundException 等）が登録されており、ThrottlerException は含まれないこと', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';

		loadInstrument();

		const options = lastInitOptions();
		expect(Array.isArray(options.ignoreErrors)).toBe(true);
		expect(options.ignoreErrors).toEqual(
			expect.arrayContaining([
				'NotFoundException',
				'BadRequestException',
				'UnauthorizedException',
				'ForbiddenException',
			]),
		);
		expect(options.ignoreErrors).not.toContain('ThrottlerException');
	});

	it('Sentry.init が例外を投げても起動を妨げず console.warn だけ呼ぶこと', () => {
		process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
		initMock.mockImplementationOnce(() => {
			throw new Error('Sentry.init exploded');
		});

		expect(() => loadInstrument()).not.toThrow();
		expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
	});
});
