import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-google-oauth20';
import { ConfigService } from '../config/config.service';
import type { GoogleStrategyUser } from './types/oauth.types';

interface GoogleProfile {
	id: string;
	name?: {
		givenName?: string;
		familyName?: string;
	};
	emails?: Array<{ value: string }>;
	photos?: Array<{ value: string }>;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
	constructor(private readonly configService: ConfigService) {
		super({
			clientID: configService.googleClientId,
			clientSecret: configService.googleClientSecret,
			callbackURL: configService.googleRedirectUri,
			scope: ['email', 'profile'],
		} as StrategyOptions);
	}

	validate(accessToken: string, refreshToken: string, profile: GoogleProfile): GoogleStrategyUser {
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
