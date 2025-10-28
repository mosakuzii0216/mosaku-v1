import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-google-oauth20';
import { AuthService } from './auth.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService,
	) {
		super({
			clientID: configService.googleClientId,
			clientSecret: configService.googleClientSecret,
			callbackURL: configService.googleRedirectUri,
			scope: ['email', 'profile'],
		} as StrategyOptions);
	}

	async validate(accessToken: string, refreshToken: string, profile: any): Promise<any> {
		const { id, name, emails, photos } = profile;

		const user = {
			googleId: id,
			email: emails[0].value,
			name: `${name.givenName} ${name.familyName}`,
			firstName: name.givenName,
			lastName: name.familyName,
			picture: photos[0].value,
			accessToken,
			refreshToken,
		};

		return user;
	}
}
