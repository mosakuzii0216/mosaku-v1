import type { OAUTH_START_PROVIDERS } from '../dto/oauth-start.dto';

/** 有効プロバイダ集合の単一真実源（`OAUTH_START_PROVIDERS`）から導出。 */
export type OAuthProvider = (typeof OAUTH_START_PROVIDERS)[number];

export interface GoogleProfile {
	id: string;
	name?: {
		givenName?: string;
		familyName?: string;
	};
	emails?: Array<{ value: string }>;
	photos?: Array<{ value: string }>;
}

export interface BaseOAuthUser {
	id: string;
	email?: string;
	name: string;
	provider: OAuthProvider;
}

export interface GoogleOAuthUser extends BaseOAuthUser {
	provider: 'google';
	googleId: string;
}

export type OAuthUser = GoogleOAuthUser;

export interface GoogleStrategyUser {
	googleId: string;
	email?: string;
	name: string;
	firstName?: string;
	lastName?: string;
	picture?: string;
	accessToken?: string;
	refreshToken?: string;
}

export interface AppleStrategyUser {
	appleId: string;
	name: string;
	email?: string;
	accessToken?: string;
}

export interface XStrategyUser {
	xId: string;
	name: string;
	username?: string;
	email?: string;
	picture?: string;
	accessToken?: string;
}

export type OAuthStrategyUser = GoogleStrategyUser | AppleStrategyUser | XStrategyUser;

export interface OAuthConfig {
	getProviderId: (user: OAuthStrategyUser) => string;
	normalizeUser: (user: OAuthStrategyUser) => BaseOAuthUser;
	generateFallbackEmail?: (user: OAuthStrategyUser) => string;
}
