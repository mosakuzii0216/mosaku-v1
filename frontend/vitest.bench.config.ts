/**
 * PWA パフォーマンス計測用の Vitest 設定（Task 10.3）。
 *
 * 既存テスト（`*.test.ts`）と分離するため、`*.bench.ts` だけを対象にする。
 * CI から `vitest run --config vitest.bench.config.ts` で起動する。
 */
import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['**/*.bench.ts'],
		exclude: [...configDefaults.exclude, 'e2e/**'],
		testTimeout: 120_000,
		hookTimeout: 60_000,
		alias: {
			'virtual:pwa-register/react': fileURLToPath(
				new URL('./src/test/mocks/virtualPwaRegisterReact.ts', import.meta.url),
			),
		},
	},
});
