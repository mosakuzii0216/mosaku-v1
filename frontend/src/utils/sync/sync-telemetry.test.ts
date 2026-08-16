import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSyncTelemetry, type SyncTelemetrySentryApi } from './sync-telemetry';

type ScopeStub = { setTag: ReturnType<typeof vi.fn>; setLevel?: ReturnType<typeof vi.fn> };

function buildSentryStub(): SyncTelemetrySentryApi & {
	mocks: {
		addBreadcrumb: ReturnType<typeof vi.fn>;
		captureEvent: ReturnType<typeof vi.fn>;
		withScope: ReturnType<typeof vi.fn>;
		setTag: ReturnType<typeof vi.fn>;
	};
} {
	const addBreadcrumb = vi.fn();
	const captureEvent = vi.fn();
	const setTag = vi.fn();
	const withScope = vi.fn((cb: (scope: ScopeStub) => void) => cb({ setTag }));
	return {
		addBreadcrumb,
		captureEvent,
		withScope: withScope as unknown as SyncTelemetrySentryApi['withScope'],
		mocks: { addBreadcrumb, captureEvent, withScope, setTag },
	};
}

describe('SyncTelemetry', () => {
	let sentry: ReturnType<typeof buildSentryStub>;

	beforeEach(() => {
		sentry = buildSentryStub();
	});

	describe('breadcrumb()', () => {
		it('cycle-start の breadcrumb を category=sync / level=info で送出する', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.breadcrumb('cycle-start', {});

			expect(sentry.mocks.addBreadcrumb).toHaveBeenCalledTimes(1);
			const arg = sentry.mocks.addBreadcrumb.mock.calls[0][0];
			expect(arg.category).toBe('sync');
			expect(arg.type).toBe('info');
			expect(arg.level).toBe('info');
			expect(arg.message).toBe('cycle-start');
		});

		it('success / skipped-by-lww / removed-on-server の breadcrumb は level=info', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.breadcrumb('success', { memoId: 'm1', statusCode: 200, attempt: 1 });
			telemetry.breadcrumb('skipped-by-lww', { memoId: 'm1', statusCode: 409, attempt: 1 });
			telemetry.breadcrumb('removed-on-server', { memoId: 'm1', statusCode: 404, attempt: 1 });

			const calls = sentry.mocks.addBreadcrumb.mock.calls;
			expect(calls[0][0].level).toBe('info');
			expect(calls[1][0].level).toBe('info');
			expect(calls[2][0].level).toBe('info');
			expect(calls[0][0].message).toBe('success');
			expect(calls[1][0].message).toBe('skipped-by-lww');
			expect(calls[2][0].message).toBe('removed-on-server');
		});

		it('failed の breadcrumb は level=warning', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.breadcrumb('failed', { memoId: 'm1', statusCode: 500, attempt: 2 });

			expect(sentry.mocks.addBreadcrumb.mock.calls[0][0].level).toBe('warning');
		});

		it('data は memoId / statusCode / attempt のホワイトリストに限定する', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.breadcrumb('success', {
				memoId: 'm1',
				statusCode: 200,
				attempt: 1,
				// @ts-expect-error 余剰フィールドが渡されたケース
				content: 'これは送信されてはならない',
				title: 'これも送信されてはならない',
			});

			const data = sentry.mocks.addBreadcrumb.mock.calls[0][0].data as Record<string, unknown>;
			expect(data).toEqual({ memoId: 'm1', statusCode: 200, attempt: 1 });
			expect('content' in data).toBe(false);
			expect('title' in data).toBe(false);
		});

		it('payload に未定義の値があれば data に含めない', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.breadcrumb('cycle-start', {});

			expect(sentry.mocks.addBreadcrumb.mock.calls[0][0].data).toEqual({});
		});

		it('scrubber を経由するので想定外フィールド追加時もメモ本文・タイトルは送信されない', () => {
			// scrubber が二重防御として機能することを、カスタム scrubber を注入して検証
			const customScrub = vi.fn((event: Record<string, unknown>) => {
				return { ...event, __scrubbed: true } as Record<string, unknown>;
			});
			const telemetry = createSyncTelemetry({
				sentry,
				scrubber: { scrub: customScrub, redactTipTapDocument: vi.fn() },
			});

			telemetry.breadcrumb('success', { memoId: 'm1', statusCode: 200, attempt: 1 });

			expect(customScrub).toHaveBeenCalledTimes(1);
			const data = sentry.mocks.addBreadcrumb.mock.calls[0][0].data as Record<string, unknown>;
			expect(data.__scrubbed).toBe(true);
		});

		it('デフォルト scrubber は memoId が UUID 形式の場合に redact する（二重防御）', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.breadcrumb('success', {
				memoId: '550e8400-e29b-41d4-a716-446655440000',
				statusCode: 200,
				attempt: 1,
			});

			const data = sentry.mocks.addBreadcrumb.mock.calls[0][0].data as Record<string, unknown>;
			expect(data.memoId).toBe('[REDACTED]');
			expect(data.statusCode).toBe(200);
			expect(data.attempt).toBe(1);
		});
	});

	describe('reportRetryExhausted()', () => {
		it('captureEvent を level=error で呼び出す', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.reportRetryExhausted({ memoId: 'mx', attempt: 3, statusCode: 500 });

			expect(sentry.mocks.captureEvent).toHaveBeenCalledTimes(1);
			const event = sentry.mocks.captureEvent.mock.calls[0][0];
			expect(event.level).toBe('error');
			expect(typeof event.message).toBe('string');
		});

		it('withScope 内で feature_area / user_facing タグを必ず設定する', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.reportRetryExhausted({ memoId: 'mx', attempt: 3, statusCode: 500 });

			expect(sentry.mocks.withScope).toHaveBeenCalledTimes(1);
			expect(sentry.mocks.setTag).toHaveBeenCalledWith('feature_area', 'memo');
			expect(sentry.mocks.setTag).toHaveBeenCalledWith('user_facing', 'true');
		});

		it('extra にはホワイトリスト + scrubber を適用する', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.reportRetryExhausted({
				memoId: 'mx',
				attempt: 3,
				statusCode: 500,
				// @ts-expect-error 余剰フィールド
				content: '漏れてはならない',
			});

			const event = sentry.mocks.captureEvent.mock.calls[0][0];
			expect(event.extra).toEqual({ memoId: 'mx', statusCode: 500, attempt: 3 });
			expect(event.extra && 'content' in event.extra).toBe(false);
		});

		it('statusCode が省略されても問題なくイベントを送出する', () => {
			const telemetry = createSyncTelemetry({ sentry });

			telemetry.reportRetryExhausted({ memoId: 'mx', attempt: 3 });

			expect(sentry.mocks.captureEvent).toHaveBeenCalledTimes(1);
			const event = sentry.mocks.captureEvent.mock.calls[0][0];
			expect(event.extra).toEqual({ memoId: 'mx', attempt: 3 });
		});
	});

	describe('Trace API は使わない（既存サンプリング戦略を侵さない）', () => {
		it('startSpan / startInactiveSpan などを Sentry に持っていなくても動作する', () => {
			// minimal Sentry stub: trace 系を一切持たない
			const telemetry = createSyncTelemetry({ sentry });

			expect(() => {
				telemetry.breadcrumb('cycle-start', {});
				telemetry.breadcrumb('success', { memoId: 'm1', statusCode: 200, attempt: 1 });
				telemetry.reportRetryExhausted({ memoId: 'm1', attempt: 3, statusCode: 500 });
			}).not.toThrow();
		});
	});

	describe('既定の @sentry/react フォールバック', () => {
		it('options 未指定でも factory が SyncTelemetry を返す', () => {
			const telemetry = createSyncTelemetry();
			expect(typeof telemetry.breadcrumb).toBe('function');
			expect(typeof telemetry.reportRetryExhausted).toBe('function');
		});
	});
});
