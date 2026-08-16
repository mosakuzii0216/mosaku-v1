import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-apple';
import { ConfigService } from '../config/config.service';
import { AppLogger } from '../common/logger/app-logger.service';
import type { AppleStrategyUser } from './types/oauth.types';

interface AppleIdToken {
	sub: string;
}

@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
	private readonly isConfigured: boolean;
	private readonly logger = new AppLogger();

	constructor(private readonly configService: ConfigService) {
		const clientID = configService.appleClientId;
		const teamID = configService.appleTeamId;
		const keyID = configService.appleKeyId;
		const privateKeyString = configService.applePrivateKey;

		super({
			clientID: clientID ?? 'unconfigured',
			teamID: teamID ?? 'unconfigured',
			keyID: keyID ?? 'unconfigured',
			privateKeyString: privateKeyString ?? 'unconfigured',
			callbackURL: configService.appleRedirectUri,
			passReqToCallback: false,
		});
		this.isConfigured = !!(clientID && teamID && keyID && privateKeyString);
		if (!this.isConfigured) {
			this.logger.warn(
				'Apple OAuth is not configured. Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY to enable Apple login.',
				'AppleStrategy',
			);
		}
	}

	validate(
		accessToken: string,
		_refreshToken: string,
		idToken: AppleIdToken,
		_profile: unknown,
		firstName: string | undefined,
		lastName: string | undefined,
		email: string | undefined,
	): AppleStrategyUser {
		if (!this.isConfigured) {
			throw new ServiceUnavailableException('Apple OAuth provider is not configured');
		}
		const nameParts = [firstName, lastName].filter(Boolean);
		const name = nameParts.length > 0 ? nameParts.join(' ') : 'Apple User';

		return {
			appleId: idToken.sub,
			name,
			email,
			accessToken,
		};
	}
}
