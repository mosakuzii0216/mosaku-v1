import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '../config/config.service';
import type { AuthenticatedUser } from './types';
import { JwtTokenService } from './jwt.service';
import type { AuthTokens } from './jwt.service';
import { BCRYPT_SALT_ROUNDS } from '../config/auth-constants';
import { ERROR_CODES, throwUnauthorized, throwBadRequest } from '../common/exceptions';

export type { JwtPayload, AuthTokens } from './jwt.service';

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtTokenService: JwtTokenService,
		private readonly configService: ConfigService,
	) {}

	async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
	}

	async comparePassword(password: string, hash: string): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}

	async validateUser(email: string, password: string): Promise<AuthenticatedUser> {
		const user = await this.prisma.user.findUnique({
			where: { email },
		});

		if (!user || !user.password) {
			throwUnauthorized(ERROR_CODES.AUTH.INVALID_CREDENTIALS);
		}

		const isPasswordValid = await this.comparePassword(password, user.password);
		if (!isPasswordValid) {
			throwUnauthorized(ERROR_CODES.AUTH.INVALID_CREDENTIALS);
		}

		return this.excludePassword(user);
	}

	async validateJwtPayload(payload: { sub: string }): Promise<AuthenticatedUser> {
		const user = await this.prisma.user.findUnique({
			where: { id: payload.sub },
		});

		if (!user) {
			throwUnauthorized(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		return this.excludePassword(user);
	}

	async register(
		email: string,
		password: string,
		name?: string,
		_invitationCode?: string,
	): Promise<AuthenticatedUser> {
		const existingUser = await this.prisma.user.findUnique({
			where: { email },
		});

		if (existingUser) {
			throwBadRequest(ERROR_CODES.AUTH.EMAIL_ALREADY_EXISTS);
		}

		const hashedPassword = await this.hashPassword(password);
		const isAdmin = this.configService.isAdminEmail(email);

		const user = await this.prisma.user.create({
			data: {
				email,
				password: hashedPassword,
				name: name || email,
				role: isAdmin ? 'ADMIN' : 'USER',
			},
		});

		return this.excludePassword(user);
	}

	async login(email: string, password: string): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const user = await this.validateUser(email, password);
		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		return { ...tokens, user };
	}

	async findUserById(id: string): Promise<AuthenticatedUser> {
		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			throwUnauthorized(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		return this.excludePassword(user);
	}

	private excludePassword<T extends { password?: string | null }>(user: T): Omit<T, 'password'> {
		const { password: _, ...result } = user;
		return result;
	}
}
