import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService, JwtPayload } from './auth.service';
import type { AuthenticatedUser } from './types';
import { ConfigService } from '../config/config.service';
import { ERROR_CODES, throwUnauthorized } from '../common/exceptions';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private readonly authService: AuthService,
		private readonly configService: ConfigService,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.jwtSecret,
		});
	}

	async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
		try {
			return await this.authService.validateJwtPayload(payload);
		} catch {
			throwUnauthorized(ERROR_CODES.AUTH.INVALID_TOKEN);
		}
	}
}
