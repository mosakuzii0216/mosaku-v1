import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-line-auth';
import { ConfigService } from '../config/config.service';
import { AppLogger } from '../common/logger/app-logger.service';
import type { LineStrategyUser } from './types/oauth.types';

interface LineProfile {
	id: string;
	displayName: string;
	pictureUrl?: string;
	email?: string;
}

@Injectable()
export class LineStrategy extends PassportStrategy(Strategy, 'line') {
	private readonly isConfigured: boolean;
	private readonly logger = new AppLogger();

	constructor(private readonly configService: ConfigService) {
		const clientID = configService.lineClientId;
		const clientSecret = configService.lineClientSecret;
		super({
			channelID: clientID || 'unconfigured',
			channelSecret: clientSecret || 'unconfigured',
			callbackURL: configService.lineRedirectUri,
			scope: ['profile', 'email'],
		});
		this.isConfigured = !!(clientID && clientSecret);
		if (!this.isConfigured) {
			this.logger.warn(
				'LINE OAuth is not configured. Set LINE_CLIENT_ID and LINE_CLIENT_SECRET to enable LINE login.',
				'LineStrategy',
			);
		}
	}

	validate(accessToken: string, _refreshToken: string, profile: LineProfile): LineStrategyUser {
		if (!this.isConfigured) {
			throw new ServiceUnavailableException('LINE OAuth provider is not configured');
		}
		return {
			lineId: profile.id,
			name: profile.displayName,
			email: profile.email,
			picture: profile.pictureUrl,
			accessToken,
		};
	}
}
