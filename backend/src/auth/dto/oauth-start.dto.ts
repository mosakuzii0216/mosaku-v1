import { IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { OAuthProvider } from '../types/oauth.types';

export const OAUTH_START_PROVIDERS: ReadonlyArray<OAuthProvider> = [
	'google',
	'github',
	'line',
	'apple',
	'x',
];

export class OAuthStartParamsDto {
	@IsString()
	@IsIn(OAUTH_START_PROVIDERS)
	provider!: OAuthProvider;
}

export class OAuthStartBodyDto {
	@IsString()
	@IsNotEmpty()
	@MinLength(8)
	@MaxLength(50)
	@Matches(/^[0-9A-Za-z]+$/, { message: 'invitationCode must be alphanumeric' })
	invitationCode!: string;
}

export interface OAuthStartResponse {
	authorizationUrl: string;
}
