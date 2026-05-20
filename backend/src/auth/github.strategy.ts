import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '../config/config.service';
import { AppLogger } from '../common/logger/app-logger.service';
import type { GitHubProfile, GitHubStrategyUser } from './types/oauth.types';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
	private readonly isConfigured: boolean;
	private readonly logger = new AppLogger();

	constructor(private readonly configService: ConfigService) {
		const clientID = configService.githubClientId;
		const clientSecret = configService.githubClientSecret;
		super({
			clientID: clientID ?? 'unconfigured',
			clientSecret: clientSecret ?? 'unconfigured',
			callbackURL: configService.githubRedirectUri,
			scope: ['user:email'],
		});
		this.isConfigured = !!(clientID && clientSecret);
		if (!this.isConfigured) {
			this.logger.warn(
				'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable GitHub login.',
				'GitHubStrategy',
			);
		}
	}

	validate(accessToken: string, refreshToken: string, profile: GitHubProfile): GitHubStrategyUser {
		if (!this.isConfigured) {
			throw new ServiceUnavailableException('GitHub OAuth provider is not configured');
		}
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
