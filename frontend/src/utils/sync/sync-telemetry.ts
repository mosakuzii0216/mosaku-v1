import * as Sentry from '@sentry/react';

import { createScrubber, type FrontendSentryScrubber } from '../sentry/sentry-scrubber';

import type { SyncTelemetry } from './types';

type BreadcrumbStage = Parameters<SyncTelemetry['breadcrumb']>[0];
type BreadcrumbPayload = Parameters<SyncTelemetry['breadcrumb']>[1];
type RetryPayload = Parameters<SyncTelemetry['reportRetryExhausted']>[0];

const ALLOWED_KEYS = ['memoId', 'statusCode', 'attempt'] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

type ScopeLike = { setTag(key: string, value: string): void };

export interface SyncTelemetrySentryApi {
	addBreadcrumb(breadcrumb: {
		category: string;
		message: string;
		level: 'info' | 'warning' | 'error';
		type: 'info';
		data: Record<string, unknown>;
	}): void;
	captureEvent(event: { message: string; level: 'error'; extra: Record<string, unknown> }): void;
	withScope(callback: (scope: ScopeLike) => void): void;
}

export interface SyncTelemetryOptions {
	sentry?: SyncTelemetrySentryApi;
	scrubber?: FrontendSentryScrubber;
}

export function createSyncTelemetry(options: SyncTelemetryOptions = {}): SyncTelemetry {
	const sentry: SyncTelemetrySentryApi =
		options.sentry ?? (Sentry as unknown as SyncTelemetrySentryApi);
	const scrubber = options.scrubber ?? createScrubber();

	return {
		breadcrumb(stage: BreadcrumbStage, payload: BreadcrumbPayload): void {
			const data = scrubber.scrub(whitelist(payload));
			sentry.addBreadcrumb({
				category: 'sync',
				message: stage,
				type: 'info',
				level: stage === 'failed' ? 'warning' : 'info',
				data,
			});
		},

		reportRetryExhausted(payload: RetryPayload): void {
			const extra = scrubber.scrub(whitelist(payload));
			sentry.withScope((scope) => {
				scope.setTag('feature_area', 'memo');
				scope.setTag('user_facing', 'true');
				sentry.captureEvent({
					message: 'sync.retry-exhausted',
					level: 'error',
					extra,
				});
			});
		},
	};
}

function whitelist(payload: Partial<Record<AllowedKey, unknown>>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of ALLOWED_KEYS) {
		const value = payload[key];
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}
