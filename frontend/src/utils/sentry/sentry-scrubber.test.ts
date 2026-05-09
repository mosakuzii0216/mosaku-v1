import { describe, it, expect } from 'vitest';
import { createScrubber } from './sentry-scrubber';

describe('FrontendSentryScrubber', () => {
	const scrubber = createScrubber();

	describe('キー名ブラックリスト', () => {
		it('memo content を [REDACTED] に置換すること', () => {
			const event = {
				request: {
					data: {
						content: '機密メモ本文',
						title: 'タイトル',
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.request.data.content).toBe('[REDACTED]');
			expect(result.request.data.title).toBe('タイトル');
		});

		it('body / html / code を [REDACTED] に置換すること', () => {
			const event = {
				request: {
					data: {
						body: 'メモ本文',
						html: '<p>HTML本文</p>',
						code: 'INVITE-XYZ',
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.request.data.body).toBe('[REDACTED]');
			expect(result.request.data.html).toBe('[REDACTED]');
			expect(result.request.data.code).toBe('[REDACTED]');
		});

		it('invitationCode を [REDACTED] に置換すること', () => {
			const event = {
				extra: {
					invitationCode: 'INVITE-ABC-123',
				},
			};

			const result = scrubber.scrub(event);

			expect(result.extra.invitationCode).toBe('[REDACTED]');
		});

		it('password / newPassword / currentPassword を [REDACTED] に置換すること', () => {
			const event = {
				request: {
					data: {
						password: 'secretPass',
						newPassword: 'newPass',
						currentPassword: 'curPass',
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.request.data.password).toBe('[REDACTED]');
			expect(result.request.data.newPassword).toBe('[REDACTED]');
			expect(result.request.data.currentPassword).toBe('[REDACTED]');
		});

		it('token / accessToken / refreshToken を [REDACTED] に置換すること', () => {
			const event = {
				request: {
					headers: {
						token: 'abc',
						accessToken: 'access-xyz',
						refreshToken: 'refresh-xyz',
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.request.headers.token).toBe('[REDACTED]');
			expect(result.request.headers.accessToken).toBe('[REDACTED]');
			expect(result.request.headers.refreshToken).toBe('[REDACTED]');
		});

		it('clientSecret / privateKey を [REDACTED] に置換すること', () => {
			const event = {
				extra: {
					clientSecret: 'oauth-client-secret',
					privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
				},
			};

			const result = scrubber.scrub(event);

			expect(result.extra.clientSecret).toBe('[REDACTED]');
			expect(result.extra.privateKey).toBe('[REDACTED]');
		});
	});

	describe('値の正規表現マッチ', () => {
		it('JWT 形式の文字列を [REDACTED] に置換すること', () => {
			const jwt =
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
			const event = {
				extra: {
					authorizationHeader: `Bearer ${jwt}`,
				},
			};

			const result = scrubber.scrub(event);

			expect(result.extra.authorizationHeader).toBe('[REDACTED]');
		});

		it('UUID 形式の文字列を [REDACTED] に置換すること', () => {
			const event = {
				extra: {
					randomId: '550e8400-e29b-41d4-a716-446655440000',
				},
			};

			const result = scrubber.scrub(event);

			expect(result.extra.randomId).toBe('[REDACTED]');
		});
	});

	describe('Sentry 予約 ID は redact しない', () => {
		// Sentry SDK が生成する debug_id / event_id / trace_id 等は UUID 形式だが
		// release 紐付けや trace 検索のキーであり、redact すると Sentry 側が
		// "invalid debug identifier" 等で reject し sourcemap 解決が壊れる
		it('debug_meta.images[].debug_id は UUID でも保持すること', () => {
			const event = {
				debug_meta: {
					images: [
						{
							type: 'sourcemap',
							code_file: 'https://example.com/index.js',
							debug_id: '06ceff95-39af-47f4-b030-6e45987fe06b',
						},
					],
				},
			};

			const result = scrubber.scrub(event);

			expect(result.debug_meta.images[0].debug_id).toBe('06ceff95-39af-47f4-b030-6e45987fe06b');
		});

		it('event_id / trace_id / span_id / parent_span_id は UUID/16進数でも保持すること', () => {
			const event = {
				event_id: '5233bc984e73447d955cf2b0cebc537f',
				contexts: {
					trace: {
						trace_id: 'ff344dd1e65f4e5083f65832e007e9f1',
						span_id: '9fb0b6a3b13987e7',
						parent_span_id: '550e8400-e29b-41d4-a716-446655440000',
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.event_id).toBe('5233bc984e73447d955cf2b0cebc537f');
			expect(result.contexts.trace.trace_id).toBe('ff344dd1e65f4e5083f65832e007e9f1');
			expect(result.contexts.trace.span_id).toBe('9fb0b6a3b13987e7');
			expect(result.contexts.trace.parent_span_id).toBe('550e8400-e29b-41d4-a716-446655440000');
		});

		it('profile_id / replay_id も UUID でも保持すること', () => {
			const event = {
				contexts: {
					profile: { profile_id: '550e8400-e29b-41d4-a716-446655440000' },
					replay: { replay_id: '06ceff95-39af-47f4-b030-6e45987fe06b' },
				},
			};

			const result = scrubber.scrub(event);

			expect(result.contexts.profile.profile_id).toBe('550e8400-e29b-41d4-a716-446655440000');
			expect(result.contexts.replay.replay_id).toBe('06ceff95-39af-47f4-b030-6e45987fe06b');
		});

		it('予約キー以外の場所の UUID は引き続き redact すること（既存挙動）', () => {
			const event = {
				extra: {
					someUserUuid: '550e8400-e29b-41d4-a716-446655440000',
				},
			};

			const result = scrubber.scrub(event);

			expect(result.extra.someUserUuid).toBe('[REDACTED]');
		});
	});

	describe('再帰走査（breadcrumbs / formData / React Query cache）', () => {
		it('breadcrumbs[].data 内のメモ本文をマスクすること', () => {
			const event = {
				breadcrumbs: [
					{
						category: 'memo',
						data: {
							content: 'breadcrumb 内の本文',
							memoId: 'public-id',
						},
					},
				],
			};

			const result = scrubber.scrub(event);

			expect(result.breadcrumbs[0].data.content).toBe('[REDACTED]');
			expect(result.breadcrumbs[0].data.memoId).toBe('public-id');
		});

		it('formData 内の招待コードをマスクすること', () => {
			const event = {
				extra: {
					formData: {
						invitationCode: 'INVITE-XYZ',
						email: 'user@example.com',
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.extra.formData.invitationCode).toBe('[REDACTED]');
			expect(result.extra.formData.email).toBe('user@example.com');
		});

		it('React Query cache snapshot 内のメモ本文をマスクすること', () => {
			const event = {
				contexts: {
					reactQuery: {
						queries: [
							{
								queryKey: ['memos', 'detail', '123'],
								data: {
									id: '123',
									content: 'メモの本文',
								},
							},
						],
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.contexts.reactQuery.queries[0].data.content).toBe('[REDACTED]');
			expect(result.contexts.reactQuery.queries[0].data.id).toBe('123');
		});
	});

	describe('循環参照ガード', () => {
		it('循環参照を含む event でも例外を投げないこと', () => {
			const event: Record<string, unknown> = { extra: {} };
			(event.extra as Record<string, unknown>).self = event;

			expect(() => scrubber.scrub(event)).not.toThrow();
		});
	});

	describe('巨大文字列の truncate', () => {
		it('10KB を超える文字列は truncate されること', () => {
			const huge = 'a'.repeat(11_000);
			const event = {
				extra: {
					hugeField: huge,
				},
			};

			const result = scrubber.scrub(event);
			const hugeField = result.extra.hugeField;

			expect(typeof hugeField).toBe('string');
			expect(hugeField.length).toBeLessThanOrEqual(10_000 + 50);
			expect(hugeField).toContain('[TRUNCATED]');
		});
	});

	describe('非破壊性', () => {
		it('元の event を破壊変更しないこと', () => {
			const event = {
				request: {
					data: {
						content: 'オリジナル本文',
					},
				},
			};
			const before = JSON.parse(JSON.stringify(event));

			scrubber.scrub(event);

			expect(event).toEqual(before);
		});
	});

	describe('redactTipTapDocument', () => {
		it('TipTap doc の text ノードを [REDACTED] に置換すること', () => {
			const doc = {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'これは本文です' }],
					},
				],
			};

			const result = scrubber.redactTipTapDocument(doc) as typeof doc;

			expect(result.content[0].content[0].text).toBe('[REDACTED]');
			expect(result.content[0].content[0].type).toBe('text');
			expect(result.type).toBe('doc');
		});

		it('深さ 4 階層の text ノードもマスクすること', () => {
			const doc = {
				type: 'doc',
				content: [
					{
						type: 'bulletList',
						content: [
							{
								type: 'listItem',
								content: [
									{
										type: 'paragraph',
										content: [{ type: 'text', text: '深い本文' }],
									},
								],
							},
						],
					},
				],
			};

			const result = scrubber.redactTipTapDocument(doc) as Record<string, unknown>;
			const text = (
				(
					(
						(result.content as Array<Record<string, unknown>>)[0].content as Array<
							Record<string, unknown>
						>
					)[0].content as Array<Record<string, unknown>>
				)[0].content as Array<Record<string, unknown>>
			)[0].text;

			expect(text).toBe('[REDACTED]');
		});

		it('元の TipTap doc を破壊変更しないこと', () => {
			const doc = {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'オリジナル' }] }],
			};
			const before = JSON.parse(JSON.stringify(doc));

			scrubber.redactTipTapDocument(doc);

			expect(doc).toEqual(before);
		});
	});

	describe('オプション', () => {
		it('カスタムキーを redactableKeys に追加できること', () => {
			const customScrubber = createScrubber({
				redactableKeys: new Set(['customField']),
			});
			const event = {
				extra: {
					customField: 'sensitive',
					content: 'これはマスクされない（custom set のみ）',
				},
			};

			const result = customScrubber.scrub(event);

			expect(result.extra.customField).toBe('[REDACTED]');
			expect(result.extra.content).toBe('これはマスクされない（custom set のみ）');
		});

		it('placeholder を変更できること', () => {
			const customScrubber = createScrubber({ placeholder: '***' });
			const event = {
				request: {
					data: { password: 'pw' },
				},
			};

			const result = customScrubber.scrub(event);

			expect(result.request.data.password).toBe('***');
		});
	});
});
