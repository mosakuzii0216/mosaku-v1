export type OAuthProvider = 'google' | 'github' | 'x';

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

export interface XOAuthUser extends BaseOAuthUser {
	provider: 'x';
	xId: string;
	username?: string;
}

export type OAuthUser = GoogleOAuthUser | GitHubOAuthUser | XOAuthUser;

export interface OAuthConfig {
	getProviderId: (user: any) => string;
	normalizeUser: (user: any) => BaseOAuthUser;
	generateFallbackEmail?: (user: any) => string;
}
