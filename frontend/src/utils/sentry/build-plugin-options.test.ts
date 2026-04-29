import { describe, it, expect } from 'vitest';
import { buildSentryVitePluginOptions } from './build-plugin-options';

describe('buildSentryVitePluginOptions', () => {
	it('SENTRY_AUTH_TOKEN が未設定なら disable: true を返す', () => {
		const options = buildSentryVitePluginOptions({
			SENTRY_ORG: 'org',
			SENTRY_PROJECT: 'project',
			SENTRY_AUTH_TOKEN: undefined,
			VITE_SENTRY_RELEASE: 'abc123',
		});

		expect(options.disable).toBe(true);
	});

	it('SENTRY_AUTH_TOKEN が空文字でも disable: true を返す', () => {
		const options = buildSentryVitePluginOptions({
			SENTRY_ORG: 'org',
			SENTRY_PROJECT: 'project',
			SENTRY_AUTH_TOKEN: '',
			VITE_SENTRY_RELEASE: 'abc123',
		});

		expect(options.disable).toBe(true);
	});

	it('SENTRY_AUTH_TOKEN が設定されていれば disable: false を返す', () => {
		const options = buildSentryVitePluginOptions({
			SENTRY_ORG: 'org',
			SENTRY_PROJECT: 'project',
			SENTRY_AUTH_TOKEN: 'token-value',
			VITE_SENTRY_RELEASE: 'abc123',
		});

		expect(options.disable).toBe(false);
	});

	it('org / project / authToken をそのまま渡す', () => {
		const options = buildSentryVitePluginOptions({
			SENTRY_ORG: 'mosaku-org',
			SENTRY_PROJECT: 'mosaku-frontend',
			SENTRY_AUTH_TOKEN: 'token-value',
			VITE_SENTRY_RELEASE: 'sha-xyz',
		});

		expect(options.org).toBe('mosaku-org');
		expect(options.project).toBe('mosaku-frontend');
		expect(options.authToken).toBe('token-value');
	});

	it('VITE_SENTRY_RELEASE を release.name に渡す', () => {
		const options = buildSentryVitePluginOptions({
			SENTRY_ORG: 'org',
			SENTRY_PROJECT: 'project',
			SENTRY_AUTH_TOKEN: 'token-value',
			VITE_SENTRY_RELEASE: 'release-sha',
		});

		expect(options.release).toEqual({ name: 'release-sha' });
	});

	it('release は VITE_SENTRY_RELEASE 未設定でも未指定で生成される（SDK fallback に任せる）', () => {
		const options = buildSentryVitePluginOptions({
			SENTRY_ORG: 'org',
			SENTRY_PROJECT: 'project',
			SENTRY_AUTH_TOKEN: 'token-value',
			VITE_SENTRY_RELEASE: undefined,
		});

		expect(options.release).toEqual({ name: undefined });
	});

	it('sourcemaps.filesToDeleteAfterUpload で .js.map を最終成果物から除去する', () => {
		const options = buildSentryVitePluginOptions({
			SENTRY_ORG: 'org',
			SENTRY_PROJECT: 'project',
			SENTRY_AUTH_TOKEN: 'token-value',
			VITE_SENTRY_RELEASE: 'release-sha',
		});

		expect(options.sourcemaps).toEqual({
			filesToDeleteAfterUpload: ['**/*.js.map'],
		});
	});
});
