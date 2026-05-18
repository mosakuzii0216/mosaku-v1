import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { ConfigService } from '../config/config.service';
import { AppLogger } from '../common/logger/app-logger.service';
import type { GoogleProfile, GoogleStrategyUser } from './types/oauth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
	private readonly isConfigured: boolean;
	private readonly logger = new AppLogger();

	constructor(private readonly configService: ConfigService) {
		const clientID = configService.googleClientId;
		const clientSecret = configService.googleClientSecret;
		super({
			clientID: clientID ?? 'unconfigured',
			clientSecret: clientSecret ?? 'unconfigured',
			callbackURL: configService.googleRedirectUri,
			scope: ['email', 'profile'],
		});
		this.isConfigured = !!(clientID && clientSecret);
		if (!this.isConfigured) {
			this.logger.warn(
				'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google login.',
				'GoogleStrategy',
			);
		}
	}

	validate(accessToken: string, refreshToken: string, profile: GoogleProfile): GoogleStrategyUser {
		if (!this.isConfigured) {
			throw new ServiceUnavailableException('Google OAuth provider is not configured');
		}
		const { id, name, emails, photos } = profile;

		const user: GoogleStrategyUser = {
			googleId: id,
			email: emails?.[0]?.value,
			name: `${name?.givenName ?? ''} ${name?.familyName ?? ''}`.trim(),
			firstName: name?.givenName,
			lastName: name?.familyName,
			picture: photos?.[0]?.value,
			accessToken,
			refreshToken,
		};

		return user;
	}
}
