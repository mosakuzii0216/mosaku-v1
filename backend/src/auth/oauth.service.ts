import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import { JwtTokenService } from './jwt.service';
import type { AuthTokens } from './jwt.service';
import type { BaseOAuthUser, GitHubStrategyUser, GoogleStrategyUser } from './types/oauth.types';
import type { AuthenticatedUser } from './types';
import { ERROR_CODES, throwBadRequest } from '../common/exceptions';

@Injectable()
export class OAuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtTokenService: JwtTokenService,
		private readonly configService: ConfigService,
		private readonly invitationService: InvitationService,
	) {}

	private excludePassword<T extends { password?: string | null }>(user: T): Omit<T, 'password'> {
		const { password: _, ...result } = user;
		return result;
	}

	private isAdminEmail(email?: string): boolean {
		return this.configService.isAdminEmail(email);
	}

	/**
	 * 共通 OAuth ログイン処理
	 */
	async handleOAuthLogin(
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

		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		return { ...tokens, user: this.excludePassword(user) };
	}

	/**
	 * 共通 OAuth 招待コード付き登録処理
	 */
	async handleOAuthRegistrationWithInvitation(
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

		const isAdmin = this.isAdminEmail(userEmail);

		const user = await this.prisma.user.create({
			data: {
				oauthId: providerId,
				email: userEmail,
				name: oauthUser.name,
				role: isAdmin ? 'ADMIN' : 'FREE',
				emailVerified: !!oauthUser.email,
			},
		});

		// 招待コード使用回数を更新
		await this.invitationService.useInvitation(invitationCode);

		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		return { ...tokens, user: this.excludePassword(user) };
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
}
