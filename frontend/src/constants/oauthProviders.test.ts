import { describe, it, expect } from 'vitest';
import { OAUTH_PROVIDER_IDS } from './oauthProviders';
import type { OAuthProvider } from './oauthProviders';

describe('OAUTH_PROVIDER_IDS', () => {
	it('有効な3プロバイダ（google/x/apple）のみを含むこと', () => {
		expect(OAUTH_PROVIDER_IDS).toEqual(['google', 'x', 'apple']);
	});

	it('廃止プロバイダ（github/line）を含まないこと', () => {
		expect(OAUTH_PROVIDER_IDS).not.toContain('github');
		expect(OAUTH_PROVIDER_IDS).not.toContain('line');
	});

	it('OAuthProvider 型が OAUTH_PROVIDER_IDS の要素と一致すること', () => {
		const providers: OAuthProvider[] = ['google', 'x', 'apple'];
		expect(providers).toEqual(OAUTH_PROVIDER_IDS);
	});
});
