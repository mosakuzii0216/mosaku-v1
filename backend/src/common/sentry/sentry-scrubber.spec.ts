import { createScrubber } from './sentry-scrubber';

describe('SentryScrubber', () => {
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

		it('tokenHash を [REDACTED] に置換すること', () => {
			const event = {
				extra: {
					tokenHash: 'a'.repeat(64),
				},
			};

			const result = scrubber.scrub(event);

			expect(result.extra.tokenHash).toBe('[REDACTED]');
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

	describe('再帰走査', () => {
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

		it('contexts ネストの深いキーもマスクすること', () => {
			const event = {
				contexts: {
					custom: {
						deeply: {
							nested: {
								password: 'super-secret',
							},
						},
					},
				},
			};

			const result = scrubber.scrub(event);

			expect(result.contexts.custom.deeply.nested.password).toBe('[REDACTED]');
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
			const before = JSON.parse(JSON.stringify(event)) as typeof event;

			scrubber.scrub(event);

			expect(event).toEqual(before);
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
