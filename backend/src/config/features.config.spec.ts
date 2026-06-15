/**
 * MCP_ENDPOINT フィーチャーフラグの土台テスト。
 * env を入れ替えてモジュールを再評価するため jest.resetModules を使う。
 */
describe('FEATURES.MCP_ENDPOINT', () => {
	const ORIGINAL = process.env.FEATURE_MCP_ENDPOINT;

	afterEach(() => {
		if (ORIGINAL === undefined) {
			delete process.env.FEATURE_MCP_ENDPOINT;
		} else {
			process.env.FEATURE_MCP_ENDPOINT = ORIGINAL;
		}
		jest.resetModules();
	});

	function loadFeatures() {
		let mod!: typeof import('./features.config');
		jest.isolateModules(() => {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			mod = require('./features.config') as typeof import('./features.config');
		});
		return mod;
	}

	it('未設定なら既定で無効（MCP 入口は off）', () => {
		delete process.env.FEATURE_MCP_ENDPOINT;
		const { FEATURES, isFeatureEnabled } = loadFeatures();
		expect(FEATURES.MCP_ENDPOINT).toBe(false);
		expect(isFeatureEnabled('MCP_ENDPOINT')).toBe(false);
	});

	it('FEATURE_MCP_ENDPOINT=true で有効化できる', () => {
		process.env.FEATURE_MCP_ENDPOINT = 'true';
		const { isFeatureEnabled } = loadFeatures();
		expect(isFeatureEnabled('MCP_ENDPOINT')).toBe(true);
	});

	it('true 以外の値は無効として扱う', () => {
		process.env.FEATURE_MCP_ENDPOINT = '1';
		const { isFeatureEnabled } = loadFeatures();
		expect(isFeatureEnabled('MCP_ENDPOINT')).toBe(false);
	});
});
