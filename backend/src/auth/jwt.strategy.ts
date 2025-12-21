import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService, JwtPayload } from './auth.service';
import type { AuthenticatedUser } from './types';
import { ConfigService } from '../config/config.service';

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
		} catch (_error) {
			throw new UnauthorizedException('Invalid token');
		}
	}
}
