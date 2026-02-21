import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-github2';
import { ConfigService } from '../config/config.service';
import type { GitHubStrategyUser } from './types/oauth.types';

interface GitHubProfile {
	id: string;
	username?: string;
	displayName?: string;
	emails?: Array<{ value: string }>;
	photos?: Array<{ value: string }>;
}

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
	constructor(private readonly configService: ConfigService) {
		const clientID = configService.githubClientId;
		const clientSecret = configService.githubClientSecret;
		if (!clientID || !clientSecret) {
			throw new Error(
				'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.',
			);
		}
		super({
			clientID,
			clientSecret,
			callbackURL: configService.githubRedirectUri,
			scope: ['user:email'],
		} as StrategyOptions);
	}

	validate(accessToken: string, refreshToken: string, profile: GitHubProfile): GitHubStrategyUser {
		const { id, username, displayName, emails, photos } = profile;

		const user: GitHubStrategyUser = {
			githubId: id,
			email: emails?.[0]?.value,
			username,
			name: displayName ?? username ?? id,
			picture: photos?.[0]?.value,
			accessToken,
			refreshToken,
		};

		return user;
	}
}
