import { applyStandardTags, resolveFeatureArea } from './sentry-tags';

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

		it('元の event を破壊変更しないこと', () => {
			const event = {
				request: { url: '/memo/123' },
			};
			const before = JSON.parse(JSON.stringify(event));

			applyStandardTags(event);

			expect(event).toEqual(before);
		});
	});
});
