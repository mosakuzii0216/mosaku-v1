/**
 * 有効な OAuth プロバイダの単一真実源。
 * ここを変更すれば OAuthProvider 型・各参照が自動で追従する。
 */
export const OAUTH_PROVIDER_IDS = ['google', 'x', 'apple'] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDER_IDS)[number];
