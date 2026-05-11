import { defineConfig, devices } from '@playwright/test';

/**
 * 既存の auth-flow / performance テストはバックエンド不要だが、
 * train-scenario と pwa-install は実バックエンド + PostgreSQL を必要とする。
 *
 * 環境変数:
 *   E2E_USE_PREVIEW=1  → frontend を `vite preview` で起動（SW 有効ビルド）
 *   E2E_BACKEND_URL    → 既定 http://localhost:3000（NestJS）
 *   E2E_USER_EMAIL     → 既定 pwa-e2e-admin@test.example
 *   E2E_USER_PASSWORD  → 既定 PwaE2eTest123!
 *
 * バックエンド側のテスト用 DB 起動と PRISMA_DEPLOY、ADMIN_EMAIL 設定は
 * .github/workflows/pwa-perf.yml で構築する。
 */

const usePreview = process.env.E2E_USE_PREVIEW === '1';
const frontendCommand = usePreview ? 'npm run preview -- --port 5173' : 'npm run dev';

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000';

const webServers = [
	{
		command: frontendCommand,
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
];

if (process.env.E2E_BACKEND_AUTOSTART === '1') {
	webServers.push({
		command: 'npm run start:dev -w backend',
		url: `${backendUrl}/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		cwd: '..',
	} as (typeof webServers)[number]);
}

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: webServers,
});
