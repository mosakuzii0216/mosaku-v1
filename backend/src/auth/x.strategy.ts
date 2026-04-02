import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import { ConfigService } from '../config/config.service';
import { AppLogger } from '../common/logger/app-logger.service';
import type { XStrategyUser } from './types/oauth.types';

interface XProfileData {
	id: string;
	name?: string;
	username?: string;
	profile_image_url?: string;
}

interface XProfile {
	data: XProfileData;
}

@Injectable()
export class XStrategy extends PassportStrategy(Strategy, 'x') {
	private readonly isConfigured: boolean;
	private readonly logger = new AppLogger();

	constructor(private readonly configService: ConfigService) {
		const clientID = configService.xClientId;
		const clientSecret = configService.xClientSecret;
		super({
			authorizationURL: 'https://twitter.com/i/oauth2/authorize',
			tokenURL: 'https://api.twitter.com/2/oauth2/token',
			clientID: clientID ?? 'unconfigured',
			clientSecret: clientSecret ?? 'unconfigured',
			callbackURL: configService.xRedirectUri,
			scope: ['tweet.read', 'users.read'],
			pkce: true,
			state: true,
		});
		this.isConfigured = !!(clientID && clientSecret);
		if (!this.isConfigured) {
			this.logger.warn(
				'X OAuth is not configured. Set X_CLIENT_ID and X_CLIENT_SECRET to enable X login.',
				'XStrategy',
			);
		}
	}

	validate(accessToken: string, _refreshToken: string, profile: XProfile): XStrategyUser {
		if (!this.isConfigured) {
			throw new ServiceUnavailableException('X OAuth provider is not configured');
		}
		const { id, name, username, profile_image_url } = profile.data;
		return {
			xId: id,
			name: name ?? username ?? id,
			username,
			email: undefined,
			picture: profile_image_url,
			accessToken,
		};
	}
}
