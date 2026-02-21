import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from './types';
import { JWT_EXPIRATION } from '../config/auth-constants';

export interface JwtPayload {
	sub: string; // user.id
	email: string;
	role: UserRole;
	iat?: number;
	exp?: number;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken?: string;
}

@Injectable()
export class JwtTokenService {
	constructor(private readonly jwtService: JwtService) {}

	generateTokens(userId: string, email: string, role: UserRole): AuthTokens {
		const payload: JwtPayload = { sub: userId, email, role };
		const accessToken = this.jwtService.sign(payload, { expiresIn: JWT_EXPIRATION });
		return { accessToken };
	}
}
