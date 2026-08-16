import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./src/test/setup.ts'],
		exclude: [...configDefaults.exclude, 'e2e/**'],
		alias: {
			// vite-plugin-pwa の virtual module はテスト環境では解決できないため、
			// テスト時のみスタブにリダイレクトする（vi.mock で各テストが上書き可能）
			'virtual:pwa-register/react': fileURLToPath(
				new URL('./src/test/mocks/virtualPwaRegisterReact.ts', import.meta.url),
			),
		},
	},
});
