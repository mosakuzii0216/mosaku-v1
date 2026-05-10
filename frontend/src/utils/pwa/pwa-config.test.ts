import { describe, expect, it } from 'vitest';
import { buildPwaOptions } from './pwa-config';

describe('buildPwaOptions', () => {
	const opts = buildPwaOptions();

	it('uses prompt-style registration so SW activation requires user confirmation', () => {
		expect(opts.registerType).toBe('prompt');
	});

	it('does not register any runtimeCaching entry that would touch /api/* (auth-protected)', () => {
		const caching = opts.workbox?.runtimeCaching ?? [];
		expect(caching.length).toBeGreaterThan(0);
		for (const entry of caching) {
			const pattern = entry.urlPattern;
			if (pattern instanceof RegExp) {
				expect(pattern.test('/api/memos')).toBe(false);
				expect(pattern.test('https://example.com/api/memos')).toBe(false);
			} else if (typeof pattern === 'string') {
				expect(pattern.includes('/api/')).toBe(false);
			}
		}
	});

	it('caches theme CSS at runtime via CacheFirst (lazy-loaded after app shell boot)', () => {
		const caching = opts.workbox?.runtimeCaching ?? [];
		const themeEntry = caching.find(
			(e) => e.urlPattern instanceof RegExp && (e.urlPattern as RegExp).test('/themes/mori.css'),
		);
		expect(themeEntry).toBeDefined();
		expect(themeEntry?.handler).toBe('CacheFirst');
		expect((themeEntry?.options as { cacheName?: string } | undefined)?.cacheName).toBeTruthy();
	});

	it('keeps theme CSS out of precache via globIgnores so initial bundle stays small', () => {
		const ignores = opts.workbox?.globIgnores ?? [];
		// dist 上では themes/<name>/<name>.css のようなネスト構造で配信されるため、
		// ネストもマッチする `**` を含むパターンが必要（`**/themes/*.css` だと取りこぼす）
		expect(ignores).toEqual(expect.arrayContaining([expect.stringMatching(/themes\/\*\*/)]));
	});

	it('does not list themes/*.css in precache globPatterns', () => {
		const patterns = opts.workbox?.globPatterns ?? [];
		expect(patterns).not.toContain('themes/*.css');
	});

	it('declines navigateFallback for /api/* so SW does not serve cached HTML for API calls', () => {
		const denylist = opts.workbox?.navigateFallbackDenylist ?? [];
		expect(denylist.some((p) => p instanceof RegExp && p.test('/api/memos'))).toBe(true);
	});

	it('precaches the app shell (HTML / JS / CSS / fonts / icons)', () => {
		const patterns = opts.workbox?.globPatterns ?? [];
		expect(patterns.length).toBeGreaterThan(0);
		const joined = patterns.join(',');
		expect(joined).toMatch(/js/);
		expect(joined).toMatch(/css/);
		expect(joined).toMatch(/html/);
		expect(joined).toMatch(/woff2/);
	});

	it('exposes a Web App Manifest with all A2HS-required fields', () => {
		const manifest = opts.manifest;
		expect(manifest).toBeDefined();
		const m = manifest as {
			name?: string;
			short_name?: string;
			start_url?: string;
			scope?: string;
			display?: string;
			theme_color?: string;
			background_color?: string;
			icons?: Array<{ sizes?: string; purpose?: string }>;
		};
		expect(m.name).toBeTruthy();
		expect(m.short_name).toBeTruthy();
		expect(m.start_url).toBe('/');
		expect(m.display).toBe('standalone');
		expect(m.theme_color).toBeTruthy();
		expect(m.background_color).toBeTruthy();
		expect(Array.isArray(m.icons)).toBe(true);
		const sizes = (m.icons ?? []).map((i) => i.sizes);
		expect(sizes).toContain('192x192');
		expect(sizes).toContain('512x512');
		expect((m.icons ?? []).some((i) => i.purpose === 'maskable')).toBe(true);
	});

	it('does not place themes/*.css in includeAssets (delegated to runtime cache)', () => {
		const includes = opts.includeAssets ?? [];
		expect(includes).not.toContain('themes/*.css');
	});

	it('disables service worker source maps to keep dist clean', () => {
		expect(opts.workbox?.sourcemap).toBe(false);
	});
});
