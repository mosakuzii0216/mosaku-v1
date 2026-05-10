import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { buildSentryVitePluginOptions } from './src/utils/sentry/build-plugin-options';
import { buildPwaOptions } from './src/utils/pwa/pwa-config';

export default defineConfig({
	plugins: [
		react(),
		VitePWA(buildPwaOptions()),
		// Source map を Sentry にアップロードしてリリース紐付け、最終成果物からは削除する
		sentryVitePlugin(
			buildSentryVitePluginOptions({
				SENTRY_ORG: process.env.SENTRY_ORG,
				SENTRY_PROJECT: process.env.SENTRY_PROJECT,
				SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
				VITE_SENTRY_RELEASE: process.env.VITE_SENTRY_RELEASE,
			}),
		),
	],
	build: {
		// Sentry に upload するため一旦生成。`filesToDeleteAfterUpload` で公開物からは削除される
		sourcemap: true,
	},
	server: {
		host: '0.0.0.0', // Dockerコンテナの外部からアクセスを許可（IPv4を明示）
		port: 5173,
		hmr: {
			port: 5173,
			host: 'localhost',
		},
		watch: {
			usePolling: true,
		},
	},
});
