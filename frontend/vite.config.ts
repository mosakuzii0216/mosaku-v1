import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { buildSentryVitePluginOptions } from './src/utils/sentry/build-plugin-options';

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			injectRegister: 'auto',
			registerType: 'autoUpdate',
			includeAssets: ['vite.svg', 'themes/*.css', 'apple-touch-icon.png'],
			devOptions: { enabled: false },
			workbox: {
				// Service Worker / workbox runtime の .map は Sentry vite-plugin の削除対象外で
				// dist に残ってしまうため、生成自体を抑止する（SW は数十行で source map 不要）
				sourcemap: false,
				globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}', 'themes/*.css'],
				navigateFallback: '/index.html',
				runtimeCaching: [
					{
						urlPattern: /\/api\//,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							networkTimeoutSeconds: 3,
						},
					},
					{
						urlPattern: /\/themes\/.+\.css$/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'theme-css',
						},
					},
				],
			},
			manifest: {
				name: 'Mosaku',
				short_name: 'Mosaku',
				description: 'メモ管理アプリ',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#ffffff',
				theme_color: '#ffffff',
				icons: [
					{
						src: 'icon-192x192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: 'icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
					},
					{
						src: 'maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
			},
		}),
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
