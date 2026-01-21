import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import type {
	BaseOAuthUser,
	GitHubStrategyUser,
	GoogleStrategyUser,
	XStrategyUser,
} from './types/oauth.types';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import type { AuthenticatedUser, UserRole } from './types';
import { BCRYPT_SALT_ROUNDS, JWT_EXPIRATION } from '../config/auth-constants';
import { ERROR_CODES, throwUnauthorized, throwBadRequest } from '../common/exceptions';

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
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,
		private readonly invitationService: InvitationService,
	) {}

	async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
	}

	async comparePassword(password: string, hash: string): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}

	generateTokens(userId: string, email: string, role: UserRole): AuthTokens {
		const payload: JwtPayload = {
			sub: userId,
			email,
			role,
		};

		const accessToken = this.jwtService.sign(payload, {
			expiresIn: JWT_EXPIRATION,
		});

		return {
			accessToken,
		};
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

		// パスワードを除外して返す
		return this.excludePassword(user);
	}

	async validateJwtPayload(payload: JwtPayload): Promise<AuthenticatedUser> {
		const user = await this.prisma.user.findUnique({
			where: { id: payload.sub },
		});

		if (!user) {
			throwUnauthorized(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		// パスワードを除外して返す
		return this.excludePassword(user);
	}

	async register(
		email: string,
		password: string,
		name?: string,
		_invitationCode?: string,
	): Promise<AuthenticatedUser> {
		// 既存ユーザーチェック
		const existingUser = await this.prisma.user.findUnique({
			where: { email },
		});

		if (existingUser) {
			throwBadRequest(ERROR_CODES.AUTH.EMAIL_ALREADY_EXISTS);
		}

		// パスワードハッシュ化
		const hashedPassword = await this.hashPassword(password);

		// 管理者メールチェック
		const isAdmin = this.configService.isAdminEmail(email);

		// ユーザー作成
		const user = await this.prisma.user.create({
			data: {
				email,
				password: hashedPassword,
				name: name || email,
				role: isAdmin ? 'ADMIN' : 'FREE',
			},
		});

		// パスワードを除外して返す
		return this.excludePassword(user);
	}

	async login(email: string, password: string): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const user = await this.validateUser(email, password);
		const tokens = this.generateTokens(user.id, user.email, user.role);

		return {
			...tokens,
			user,
		};
	}

	async findUserById(id: string): Promise<AuthenticatedUser> {
		const user = await this.prisma.user.findUnique({
			where: { id },
		});

		if (!user) {
			throwUnauthorized(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		// パスワードを除外して返す
		return this.excludePassword(user);
	}

	/**
	 * パスワードフィールドを除外するユーティリティメソッド
	 */
	private excludePassword<T extends { password?: string | null }>(user: T): Omit<T, 'password'> {
		const { password: _, ...result } = user;
		return result;
	}

	/**
	 * 管理者権限チェック
	 */
	private isAdminEmail(email?: string): boolean {
		return this.configService.isAdminEmail(email);
	}

	/**
	 * 共通 OAuth ログイン処理
	 */
	private async handleOAuthLogin(
		oauthUser: BaseOAuthUser,
		providerId: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		// OAuth IDまたはメールアドレスでユーザーを検索
		let user = await this.prisma.user.findFirst({
			where: {
				OR: [...(oauthUser.email ? [{ email: oauthUser.email }] : []), { oauthId: providerId }],
			},
		});

		if (user) {
			// 既存ユーザーの場合、OAuth IDと名前を更新
			user = await this.prisma.user.update({
				where: { id: user.id },
				data: {
					oauthId: providerId,
					name: oauthUser.name,
				},
			});
		} else {
			// 新規ユーザーの場合
			// 管理者メールアドレスの場合は招待コードなしで登録可能
			const isAdmin = this.isAdminEmail(oauthUser.email);
			if (isAdmin) {
				// 管理者ユーザーを作成
				user = await this.prisma.user.create({
					data: {
						oauthId: providerId,
						email: oauthUser.email!,
						name: oauthUser.name,
						role: 'ADMIN',
						emailVerified: !!oauthUser.email,
					},
				});
			} else {
				// 一般ユーザーは招待コードが必要
				throwBadRequest(ERROR_CODES.AUTH.INVITATION_REQUIRED);
			}
		}

		// JWTトークンを生成
		const tokens = this.generateTokens(user.id, user.email, user.role);

		return {
			...tokens,
			user: this.excludePassword(user),
		};
	}

	/**
	 * 共通 OAuth 招待コード付き登録処理
	 */
	private async handleOAuthRegistrationWithInvitation(
		oauthUser: BaseOAuthUser,
		providerId: string,
		invitationCode: string,
		fallbackEmail?: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		// 招待コードの検証
		await this.invitationService.verifyInvitation(invitationCode);

		// 既存ユーザーチェック
		const userEmail = oauthUser.email || fallbackEmail;
		if (!userEmail) {
			throwBadRequest(ERROR_CODES.VALIDATION.REQUIRED_FIELD, 'メールアドレスは必須です');
		}

		const existingUser = await this.prisma.user.findFirst({
			where: {
				OR: [{ email: userEmail }, { oauthId: providerId }],
			},
		});

		if (existingUser) {
			throwBadRequest(ERROR_CODES.AUTH.USER_ALREADY_EXISTS);
		}

		// 管理者権限チェック
		const isAdmin = this.isAdminEmail(userEmail);

		// 新規ユーザー作成
		const user = await this.prisma.user.create({
			data: {
				oauthId: providerId,
				email: userEmail,
				name: oauthUser.name,
				role: isAdmin ? 'ADMIN' : 'FREE',
				emailVerified: !!oauthUser.email, // 実際のメールがある場合のみverified
			},
		});

		// 招待コード使用回数を更新
		await this.invitationService.useInvitation(invitationCode);

		// JWTトークンを生成
		const tokens = this.generateTokens(user.id, user.email, user.role);

		return {
			...tokens,
			user: this.excludePassword(user),
		};
	}

	async googleLogin(
		googleUser: GoogleStrategyUser,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: googleUser.googleId,
			email: googleUser.email,
			name: googleUser.name,
			provider: 'google',
		};

		return this.handleOAuthLogin(normalizedUser, googleUser.googleId);
	}

	async googleRegisterWithInvitation(
		googleUser: GoogleStrategyUser,
		invitationCode: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: googleUser.googleId,
			email: googleUser.email,
			name: googleUser.name,
			provider: 'google',
		};

		return this.handleOAuthRegistrationWithInvitation(
			normalizedUser,
			googleUser.googleId,
			invitationCode,
		);
	}

	async githubLogin(
		githubUser: GitHubStrategyUser,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: githubUser.githubId,
			email: githubUser.email,
			name: githubUser.name,
			provider: 'github',
		};

		return this.handleOAuthLogin(normalizedUser, githubUser.githubId);
	}

	async githubRegisterWithInvitation(
		githubUser: GitHubStrategyUser,
		invitationCode: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: githubUser.githubId,
			email: githubUser.email,
			name: githubUser.name,
			provider: 'github',
		};

		return this.handleOAuthRegistrationWithInvitation(
			normalizedUser,
			githubUser.githubId,
			invitationCode,
		);
	}

	async xLogin(xUser: XStrategyUser): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: xUser.xId,
			email: xUser.email,
			name: xUser.name,
			provider: 'x',
		};

		return this.handleOAuthLogin(normalizedUser, xUser.xId);
	}

	async xRegisterWithInvitation(
		xUser: XStrategyUser,
		invitationCode: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		// X OAuth の場合、emailが提供されないことがあるため、フォールバックメールを生成
		const fallbackEmail = `${xUser.username}@x.placeholder.local`;

		const normalizedUser: BaseOAuthUser = {
			id: xUser.xId,
			email: xUser.email,
			name: xUser.name,
			provider: 'x',
		};

		return this.handleOAuthRegistrationWithInvitation(
			normalizedUser,
			xUser.xId,
			invitationCode,
			fallbackEmail,
		);
	}
}
