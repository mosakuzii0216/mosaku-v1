import * as Sentry from '@sentry/react';
import { AuthTokenManager, type UserProfile } from './auth';
import { getBackendUrl } from './env';
import { logger } from './logger';

export interface RefreshOutcome {
	accessToken: string;
	user: UserProfile;
}

const REFRESH_PATH = '/auth/refresh';
const LOGOUT_PATH = '/auth/logout';
const CUSTOM_HEADER_NAME = 'X-Refresh-Request';
const CUSTOM_HEADER_VALUE = '1';

let pendingRefresh: Promise<RefreshOutcome> | null = null;
let sessionGeneration = 0;

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		[CUSTOM_HEADER_NAME]: CUSTOM_HEADER_VALUE,
		...(extra ?? {}),
	};
}

function clearTokensWithBreadcrumb(
	reason: 'refresh_failed',
	extra?: Record<string, unknown>,
): void {
	AuthTokenManager.removeTokens();
	Sentry.addBreadcrumb({
		category: 'auth',
		message: 'auth_tokens_cleared',
		level: 'info',
		data: { reason, ...(extra ?? {}) },
	});
}

async function performRefresh(): Promise<RefreshOutcome> {
	const generation = sessionGeneration;
	const url = `${getBackendUrl()}${REFRESH_PATH}`;

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			credentials: 'include',
			headers: buildHeaders(),
		});
	} catch (networkError) {
		if (generation === sessionGeneration) {
			Sentry.addBreadcrumb({
				category: 'auth',
				message: 'transparent_refresh_failure',
				level: 'warning',
				data: { reason: 'network_error' },
			});
			clearTokensWithBreadcrumb('refresh_failed', { trigger: 'network_error' });
		}
		throw networkError;
	}

	if (generation !== sessionGeneration) {
		throw new Error('refresh cancelled');
	}

	if (!response.ok) {
		Sentry.addBreadcrumb({
			category: 'auth',
			message: 'transparent_refresh_failure',
			level: 'warning',
			data: { status: response.status },
		});
		clearTokensWithBreadcrumb('refresh_failed', { trigger: 'http_error', status: response.status });
		throw new Error(`refresh failed: ${response.status}`);
	}

	const body = (await response.json()) as RefreshOutcome;
	if (generation !== sessionGeneration) {
		throw new Error('refresh cancelled');
	}

	AuthTokenManager.setAccessToken(body.accessToken);
	Sentry.addBreadcrumb({
		category: 'auth',
		message: 'transparent_refresh_success',
		level: 'info',
	});
	return body;
}

export const refreshClient = {
	ensureRefreshed(): Promise<RefreshOutcome> {
		if (pendingRefresh) {
			return pendingRefresh;
		}
		const promise = performRefresh().finally(() => {
			if (pendingRefresh === promise) {
				pendingRefresh = null;
			}
		});
		pendingRefresh = promise;
		return promise;
	},

	async tryAutoRefresh(): Promise<RefreshOutcome | null> {
		try {
			const outcome = await refreshClient.ensureRefreshed();
			Sentry.captureMessage('auto_refresh_success', {
				level: 'info',
				tags: { feature_area: 'auth' },
			});
			return outcome;
		} catch (error) {
			logger.debug('tryAutoRefresh failed', error);
			Sentry.captureMessage('auto_refresh_failure', {
				level: 'info',
				tags: { feature_area: 'auth' },
			});
			return null;
		}
	},

	clearPendingRefresh(): void {
		sessionGeneration++;
		pendingRefresh = null;
	},

	async logout(): Promise<void> {
		AuthTokenManager.removeTokens();
		refreshClient.clearPendingRefresh();
		Sentry.addBreadcrumb({
			category: 'auth',
			message: 'logout',
			level: 'info',
		});

		try {
			await fetch(`${getBackendUrl()}${LOGOUT_PATH}`, {
				method: 'POST',
				credentials: 'include',
				headers: buildHeaders(),
			});
		} catch (error) {
			logger.error('Logout request failed', error);
		}
	},
};
