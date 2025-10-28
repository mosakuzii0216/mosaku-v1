import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, IStrategyOption } from 'passport-twitter';
import { AuthService } from './auth.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class XStrategy extends PassportStrategy(Strategy, 'x') {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService,
	) {
		super({
			consumerKey: configService.xConsumerKey,
			consumerSecret: configService.xConsumerSecret,
			callbackURL: configService.xRedirectUri,
			includeEmail: true,
		} as IStrategyOption);
	}

	async validate(token: string, tokenSecret: string, profile: any): Promise<any> {
		const { id, username, displayName, emails, photos } = profile;

		const user = {
			xId: id,
			email: emails?.[0]?.value,
			username,
			name: displayName || username,
			picture: photos?.[0]?.value,
			accessToken: token,
			tokenSecret,
		};

		return user;
	}
}
