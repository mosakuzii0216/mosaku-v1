import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
	createRoutesFromChildren,
	matchRoutes,
	useLocation,
	useNavigationType,
} from 'react-router';
import { envValidator } from '../env';
import { logger } from '../logger';
import { createScrubber } from './sentry-scrubber';

const scrubber = createScrubber();

const IGNORED_ERROR_PATTERNS: ReadonlyArray<string | RegExp> = [
	// ユーザー操作によるリクエスト中断は障害ではない
	'AbortError',
	// オフライン / 瞬断は復旧運用で対応するため通報しない
	'NetworkError',
	// Chromium 系の Fetch 失敗。原因はブラウザ側 / ユーザー環境側
	'Failed to fetch',
	// Safari / WebKit 系の Fetch 失敗。同上
	'Load failed',
];

const DENY_URLS: ReadonlyArray<RegExp> = [
	// ブラウザ拡張由来のエラーはアプリ管轄外
	/chrome-extension:\/\//,
	/moz-extension:\/\//,
];

export function initSentry(): void {
	const config = envValidator.getConfig();
	const dsn = config.sentryDsn;
	if (!dsn) {
		logger.info('Sentry disabled: VITE_SENTRY_DSN not set');
		return;
	}

	const environment = config.sentryEnvironment ?? 'production';
	const release = config.sentryRelease;
	const tracesSampleRate =
		config.sentryTracesSampleRate ?? (environment === 'production' ? 0.1 : 0);

	const initOptions: Record<string, unknown> = {
		dsn,
		environment,
		sendDefaultPii: false,
		sampleRate: 1.0,
		tracesSampleRate,
		enabled: true,
		integrations: [
			Sentry.reactRouterV7BrowserTracingIntegration({
				useEffect,
				useLocation,
				useNavigationType,
				createRoutesFromChildren,
				matchRoutes,
			}),
		],
		ignoreErrors: [...IGNORED_ERROR_PATTERNS],
		denyUrls: [...DENY_URLS],
		beforeSend(event: Record<string, unknown>) {
			try {
				return scrubber.scrub(event);
			} catch {
				// 安全側フォールバック: scrub が壊れた event はそもそも送らない
				return null;
			}
		},
	};

	if (release && release.length > 0) {
		initOptions.release = release;
	}

	try {
		Sentry.init(initOptions);
	} catch (error) {
		// Observability は correctness を妨げない。SDK 起動失敗は warn だけ残してアプリ起動継続
		logger.warn('Sentry.init failed; continuing without Sentry', error);
	}
}
