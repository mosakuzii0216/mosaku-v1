import {
	applyStandardTags,
	normalizeRoute,
	resolveFeatureArea,
	sanitizeRequestUrl,
} from './sentry-tags';

const SAMPLE_PUBLIC_TOKEN = 'KqM2sv8Xb1n9pQ7rT4wY6zA0cE3gH5jL8kN1mP4qR7s';

describe('SentryTags', () => {
	describe('resolveFeatureArea', () => {
		it.each([
			['/memo/123', 'memo'],
			['/memo', 'memo'],
			['/notebook/abc', 'notebook'],
			['/notebooks/xyz', 'notebook'],
			['/tag', 'tag'],
			['/tags/some', 'tag'],
			['/theme/foo', 'theme'],
			['/themes', 'theme'],
			['/auth/login', 'auth'],
			['/auth/google/callback', 'auth'],
			['/invitation/validate', 'invitation'],
			['/invitations', 'invitation'],
			['/health', 'system'],
		])('URL %s から feature_area %s を解決すること', (url, expected) => {
			expect(resolveFeatureArea(url)).toBe(expected);
		});

		it('未知の URL prefix は unknown を返すこと', () => {
			expect(resolveFeatureArea('/random-endpoint')).toBe('unknown');
		});

		it('URL が undefined の場合は unknown を返すこと', () => {
			expect(resolveFeatureArea(undefined)).toBe('unknown');
		});

		it('クエリ文字列付き URL でも prefix を解決できること', () => {
			expect(resolveFeatureArea('/memo/123?include=tags')).toBe('memo');
		});

		it('絶対 URL でも path 部分から解決できること', () => {
			expect(resolveFeatureArea('https://example.com/notebook/foo')).toBe('notebook');
		});
	});

	describe('normalizeRoute', () => {
		it('公開メモ読み取りパスのトークンを :token に正規化すること', () => {
			expect(normalizeRoute(`/memos/public/${SAMPLE_PUBLIC_TOKEN}`)).toBe('/memos/public/:token');
		});

		it('クエリ文字列を保持しつつトークンのみ正規化すること', () => {
			expect(normalizeRoute(`/memos/public/${SAMPLE_PUBLIC_TOKEN}?foo=bar`)).toBe(
				'/memos/public/:token?foo=bar',
			);
		});

		it('絶対 URL でもトークンを正規化すること', () => {
			expect(normalizeRoute(`https://mosaku.jp/memos/public/${SAMPLE_PUBLIC_TOKEN}`)).toBe(
				'https://mosaku.jp/memos/public/:token',
			);
		});

		it('公開経路以外のパスは変更しないこと', () => {
			expect(normalizeRoute('/memo/123')).toBe('/memo/123');
			expect(normalizeRoute('/memos/me/public-memos')).toBe('/memos/me/public-memos');
		});
	});

	describe('sanitizeRequestUrl', () => {
		it('request.url の公開トークンを取り除くこと', () => {
			const event = {
				request: { url: `https://mosaku.jp/memos/public/${SAMPLE_PUBLIC_TOKEN}`, method: 'GET' },
			};

			const sanitized = sanitizeRequestUrl(event);

			expect(sanitized.request.url).toBe('https://mosaku.jp/memos/public/:token');
			expect(sanitized.request.method).toBe('GET');
		});

		it('生のトークン文字列が結果に一切残らないこと', () => {
			const event = { request: { url: `/memos/public/${SAMPLE_PUBLIC_TOKEN}?x=1` } };

			const sanitized = sanitizeRequestUrl(event);

			expect(JSON.stringify(sanitized)).not.toContain(SAMPLE_PUBLIC_TOKEN);
		});

		it('公開経路を含まない event はそのまま返すこと', () => {
			const event = { request: { url: '/memo/123' } };

			expect(sanitizeRequestUrl(event)).toBe(event);
		});

		it('request が無い event でも例外を投げず返すこと', () => {
			const event = { transaction: 'MemoController.findOne' };

			expect(sanitizeRequestUrl(event)).toBe(event);
		});

		it('元の event を破壊変更しないこと', () => {
			const event = { request: { url: `/memos/public/${SAMPLE_PUBLIC_TOKEN}` } };

			sanitizeRequestUrl(event);

			expect(event.request.url).toBe(`/memos/public/${SAMPLE_PUBLIC_TOKEN}`);
		});
	});

	describe('applyStandardTags', () => {
		it('request.url から feature_area タグを付与すること', () => {
			const event = {
				request: { url: '/memo/123' },
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.feature_area).toBe('memo');
		});

		it('5xx 応答時は user_facing: true を付与すること', () => {
			const event = {
				request: { url: '/memo/123' },
				contexts: {
					response: { status_code: 500 },
				},
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.user_facing).toBe(true);
		});

		it('4xx 応答時は user_facing: false にすること', () => {
			const event = {
				request: { url: '/memo/123' },
				contexts: {
					response: { status_code: 404 },
				},
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.user_facing).toBe(false);
		});

		it('status_code が無い場合は user_facing: false にすること', () => {
			const event = {
				request: { url: '/memo/123' },
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.user_facing).toBe(false);
		});

		it('transaction から controller / handler を抽出すること', () => {
			const event = {
				request: { url: '/memo/123' },
				transaction: 'MemoController.findOne',
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.controller).toBe('MemoController');
			expect(tagged.tags.handler).toBe('findOne');
		});

		it('transaction が単一識別子の場合は controller のみを付与すること', () => {
			const event = {
				request: { url: '/memo' },
				transaction: 'MemoController',
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.controller).toBe('MemoController');
			expect(tagged.tags.handler).toBeUndefined();
		});

		it('request.url から route タグを付与すること', () => {
			const event = {
				request: { url: '/notebook/abc?x=1' },
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.route).toBe('/notebook/abc');
		});

		it('公開メモ読み取りの route タグはトークンを除いた安定ラベルにすること', () => {
			const event = {
				request: { url: `/memos/public/${SAMPLE_PUBLIC_TOKEN}` },
			};

			const tagged = applyStandardTags(event);

			expect(tagged.tags.route).toBe('/memos/public/:token');
			// feature_area は memo 固定・route で公開経路を区別する契約（Req 1.1 / 1.2）
			expect(tagged.tags.feature_area).toBe('memo');
		});

		it('元の event を破壊変更しないこと', () => {
			const event = {
				request: { url: '/memo/123' },
			};
			const before = JSON.parse(JSON.stringify(event)) as typeof event;

			applyStandardTags(event);

			expect(event).toEqual(before);
		});
	});
});
