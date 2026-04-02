import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import { JwtTokenService } from './jwt.service';
import type { AuthTokens } from './jwt.service';
import type {
	BaseOAuthUser,
	GitHubStrategyUser,
	GoogleStrategyUser,
	LineStrategyUser,
	AppleStrategyUser,
	XStrategyUser,
} from './types/oauth.types';
import type { AuthenticatedUser } from './types';
import { ERROR_CODES, throwBadRequest } from '../common/exceptions';

type UserProviderField = 'oauthId' | 'lineId' | 'appleId' | 'xId';

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
		providerField: UserProviderField = 'oauthId',
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		let user = await this.prisma.user.findFirst({
			where: {
				OR: [
					...(oauthUser.email ? [{ email: oauthUser.email }] : []),
					{ [providerField]: providerId },
				],
			},
		});

		if (user) {
			user = await this.prisma.user.update({
				where: { id: user.id },
				data: {
					[providerField]: providerId,
					name: oauthUser.name,
				},
			});
		} else {
			const isAdmin = this.isAdminEmail(oauthUser.email);
			if (isAdmin) {
				user = await this.prisma.user.create({
					data: {
						[providerField]: providerId,
						email: oauthUser.email!,
						name: oauthUser.name,
						role: 'ADMIN',
						emailVerified: !!oauthUser.email,
					},
				});
			} else {
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
		providerField: UserProviderField = 'oauthId',
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		await this.invitationService.verifyInvitation(invitationCode);

		const userEmail = oauthUser.email || fallbackEmail;
		if (!userEmail) {
			throwBadRequest(ERROR_CODES.VALIDATION.REQUIRED_FIELD, 'メールアドレスは必須です');
		}

		const existingUser = await this.prisma.user.findFirst({
			where: {
				OR: [{ email: userEmail }, { [providerField]: providerId }],
			},
		});

		if (existingUser) {
			throwBadRequest(ERROR_CODES.AUTH.USER_ALREADY_EXISTS);
		}

		const isAdmin = this.isAdminEmail(userEmail);

		const user = await this.prisma.user.create({
			data: {
				[providerField]: providerId,
				email: userEmail,
				name: oauthUser.name,
				role: isAdmin ? 'ADMIN' : 'USER',
				emailVerified: !!oauthUser.email,
			},
		});

		await this.invitationService.useInvitation(invitationCode);

		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		return { ...tokens, user: this.excludePassword(user) };
	}

	// ─── Google ─────────────────────────────────────────────────────────────

	async googleLogin(
		googleUser: GoogleStrategyUser,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: googleUser.googleId,
			email: googleUser.email,
			name: googleUser.name,
			provider: 'google',
		};
		return this.handleOAuthLogin(normalizedUser, googleUser.googleId, 'oauthId');
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
			undefined,
			'oauthId',
		);
	}

	// ─── GitHub ─────────────────────────────────────────────────────────────

	async githubLogin(
		githubUser: GitHubStrategyUser,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: githubUser.githubId,
			email: githubUser.email,
			name: githubUser.name,
			provider: 'github',
		};
		return this.handleOAuthLogin(normalizedUser, githubUser.githubId, 'oauthId');
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
			undefined,
			'oauthId',
		);
	}

	// ─── LINE ────────────────────────────────────────────────────────────────

	async lineLogin(lineUser: LineStrategyUser): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: lineUser.lineId,
			email: lineUser.email,
			name: lineUser.name,
			provider: 'line',
		};
		return this.handleOAuthLogin(normalizedUser, lineUser.lineId, 'lineId');
	}

	async lineRegisterWithInvitation(
		lineUser: LineStrategyUser,
		invitationCode: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: lineUser.lineId,
			email: lineUser.email,
			name: lineUser.name,
			provider: 'line',
		};
		return this.handleOAuthRegistrationWithInvitation(
			normalizedUser,
			lineUser.lineId,
			invitationCode,
			undefined,
			'lineId',
		);
	}

	// ─── Apple ──────────────────────────────────────────────────────────────

	async appleLogin(
		appleUser: AppleStrategyUser,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: appleUser.appleId,
			email: appleUser.email,
			name: appleUser.name,
			provider: 'apple',
		};
		return this.handleOAuthLogin(normalizedUser, appleUser.appleId, 'appleId');
	}

	async appleRegisterWithInvitation(
		appleUser: AppleStrategyUser,
		invitationCode: string,
		fallbackEmail?: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: appleUser.appleId,
			email: appleUser.email,
			name: appleUser.name,
			provider: 'apple',
		};
		return this.handleOAuthRegistrationWithInvitation(
			normalizedUser,
			appleUser.appleId,
			invitationCode,
			fallbackEmail,
			'appleId',
		);
	}

	// ─── X ──────────────────────────────────────────────────────────────────

	async xLogin(xUser: XStrategyUser): Promise<AuthTokens & { user: AuthenticatedUser }> {
		const normalizedUser: BaseOAuthUser = {
			id: xUser.xId,
			email: xUser.email,
			name: xUser.name,
			provider: 'x',
		};
		return this.handleOAuthLogin(normalizedUser, xUser.xId, 'xId');
	}

	async xRegisterWithInvitation(
		xUser: XStrategyUser,
		invitationCode: string,
	): Promise<AuthTokens & { user: AuthenticatedUser }> {
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
			undefined,
			'xId',
		);
	}
}
