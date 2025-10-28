import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-github2';
import { AuthService } from './auth.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService,
	) {
		super({
			clientID: configService.githubClientId,
			clientSecret: configService.githubClientSecret,
			callbackURL: configService.githubRedirectUri,
			scope: ['user:email'],
		} as StrategyOptions);
	}

	async validate(accessToken: string, refreshToken: string, profile: any): Promise<any> {
		const { id, username, displayName, emails, photos } = profile;

		const user = {
			githubId: id,
			email: emails?.[0]?.value,
			username,
			name: displayName || username,
			picture: photos?.[0]?.value,
			accessToken,
			refreshToken,
		};

		return user;
	}
}
