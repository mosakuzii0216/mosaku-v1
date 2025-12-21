import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, IStrategyOption } from 'passport-twitter';
import { ConfigService } from '../config/config.service';
import type { XStrategyUser } from './types/oauth.types';

interface XProfile {
	id: string;
	username?: string;
	displayName?: string;
	emails?: Array<{ value: string }>;
	photos?: Array<{ value: string }>;
}

@Injectable()
export class XStrategy extends PassportStrategy(Strategy, 'x') {
	constructor(
		private readonly configService: ConfigService,
	) {
		super({
			consumerKey: configService.xConsumerKey,
			consumerSecret: configService.xConsumerSecret,
			callbackURL: configService.xRedirectUri,
			includeEmail: true,
		} as IStrategyOption);
	}

	validate(token: string, tokenSecret: string, profile: XProfile): XStrategyUser {
		const { id, username, displayName, emails, photos } = profile;

		const user: XStrategyUser = {
			xId: id,
			email: emails?.[0]?.value,
			username,
			name: displayName ?? username ?? id,
			picture: photos?.[0]?.value,
			accessToken: token,
			tokenSecret,
		};

		return user;
	}
}
