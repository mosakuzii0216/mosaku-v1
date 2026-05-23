import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '../config/config.service';
import type { AuthenticatedUser } from './types';
import { JwtTokenService } from './jwt.service';
import type { AuthTokens } from './jwt.service';
import { BCRYPT_SALT_ROUNDS } from '../config/auth-constants';
import { ERROR_CODES, throwUnauthorized, throwBadRequest } from '../common/exceptions';
import { InvitationService } from '../invitation/invitation.service';
import { RefreshTokenService, type IssueResult } from './refresh-token.service';

export type { JwtPayload, AuthTokens } from './jwt.service';

export interface AuthRequestContext {
	ip: string | null;
	userAgent: string | null;
}

export type AuthLoginResult = AuthTokens & { user: AuthenticatedUser; refresh: IssueResult };

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtTokenService: JwtTokenService,
		private readonly configService: ConfigService,
		private readonly invitationService: InvitationService,
		private readonly refreshTokenService: RefreshTokenService,
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
		invitationCode?: string,
	): Promise<AuthenticatedUser> {
		const existingUser = await this.prisma.user.findUnique({
			where: { email },
		});

		if (existingUser) {
			throwBadRequest(ERROR_CODES.AUTH.EMAIL_ALREADY_EXISTS);
		}

		const hashedPassword = await this.hashPassword(password);
		const isAdmin = this.configService.isAdminEmail(email);

		if (isAdmin) {
			const user = await this.prisma.user.create({
				data: {
					email,
					password: hashedPassword,
					name: name || email,
					role: 'ADMIN',
				},
			});
			return this.excludePassword(user);
		}

		if (invitationCode) {
			await this.invitationService.verifyInvitation(invitationCode);
		}

		const user = await this.prisma.user.create({
			data: {
				email,
				password: hashedPassword,
				name: name || email,
				role: 'USER',
			},
		});

		if (invitationCode) {
			await this.invitationService.useInvitation(invitationCode);
		}

		return this.excludePassword(user);
	}

	async login(email: string, password: string, ctx: AuthRequestContext): Promise<AuthLoginResult> {
		const user = await this.validateUser(email, password);
		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		const refresh = await this.refreshTokenService.issue({
			userId: user.id,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return { ...tokens, user, refresh };
	}

	async registerWithTokens(
		email: string,
		password: string,
		name: string | undefined,
		invitationCode: string | undefined,
		ctx: AuthRequestContext,
	): Promise<AuthLoginResult> {
		const user = await this.register(email, password, name, invitationCode);
		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		const refresh = await this.refreshTokenService.issue({
			userId: user.id,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return { ...tokens, user, refresh };
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
