import type { VitePWAOptions } from 'vite-plugin-pwa';

const THEME_RUNTIME_CACHE_NAME = 'mosaku-theme-css';

export function buildPwaOptions(): Partial<VitePWAOptions> {
	return {
		injectRegister: 'auto',
		registerType: 'prompt',
		includeAssets: ['vite.svg', 'apple-touch-icon.png'],
		devOptions: { enabled: false },
		workbox: {
			sourcemap: false,
			globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
			globIgnores: ['**/themes/**/*.css'],
			navigateFallback: '/index.html',
			navigateFallbackDenylist: [/^\/api\//],
			runtimeCaching: [
				{
					urlPattern: /\/themes\/.+\.css$/,
					handler: 'CacheFirst',
					options: {
						cacheName: THEME_RUNTIME_CACHE_NAME,
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
	};
}
