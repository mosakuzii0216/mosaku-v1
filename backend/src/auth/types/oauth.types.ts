export type OAuthProvider = 'google' | 'github';

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

export interface GitHubOAuthUser extends BaseOAuthUser {
	provider: 'github';
	githubId: string;
}

export type OAuthUser = GoogleOAuthUser | GitHubOAuthUser;

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

export interface GitHubStrategyUser {
	githubId: string;
	email?: string;
	name: string;
	username?: string;
	picture?: string;
	accessToken?: string;
	refreshToken?: string;
}

export type OAuthStrategyUser = GoogleStrategyUser | GitHubStrategyUser;

export interface OAuthConfig {
	getProviderId: (user: OAuthStrategyUser) => string;
	normalizeUser: (user: OAuthStrategyUser) => BaseOAuthUser;
	generateFallbackEmail?: (user: OAuthStrategyUser) => string;
}
