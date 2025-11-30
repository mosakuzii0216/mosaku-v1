import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			injectRegister: 'auto',
			registerType: 'autoUpdate',
			includeAssets: ['vite.svg', 'themes/*.css', 'apple-touch-icon.png'],
			devOptions: { enabled: false },
			workbox: {
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
	],
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
