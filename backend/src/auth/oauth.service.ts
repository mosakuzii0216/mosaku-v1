import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import { JwtTokenService } from './jwt.service';
import type { AuthTokens } from './jwt.service';
import type {
	BaseOAuthUser,
	GoogleStrategyUser,
	AppleStrategyUser,
	XStrategyUser,
} from './types/oauth.types';
import type { AuthenticatedUser } from './types';
import { ERROR_CODES, throwBadRequest } from '../common/exceptions';
import { RefreshTokenService, type IssueResult } from './refresh-token.service';
import type { AuthRequestContext } from './auth.service';

type UserProviderField = 'oauthId' | 'appleId' | 'xId';

export type OAuthLoginResult = AuthTokens & { user: AuthenticatedUser; refresh: IssueResult };

export interface OAuthRegisterArgs<TUser> {
	oauthUser: TUser;
	invitationCode: string;
	ctx: AuthRequestContext;
}

export type AppleOAuthRegisterArgs = OAuthRegisterArgs<AppleStrategyUser> & {
	fallbackEmail?: string;
};

const EMPTY_CONTEXT: AuthRequestContext = { ip: null, userAgent: null };

@Injectable()
export class OAuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtTokenService: JwtTokenService,
		private readonly configService: ConfigService,
		private readonly invitationService: InvitationService,
		private readonly refreshTokenService: RefreshTokenService,
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
		ctx: AuthRequestContext = EMPTY_CONTEXT,
	): Promise<OAuthLoginResult> {
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
				// 新フローでは admin email 以外の新規ユーザーは `/invite/:code` →
				// `/auth/oauth/:provider/start` 経由の state 由来登録のみが正規ルート。
				// このコードパスに到達した場合はクライアントが旧フローを叩いた等の不正経路。
				throwBadRequest(ERROR_CODES.AUTHZ.ADMIN_EMAIL_REQUIRED);
			}
		}

		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		const refresh = await this.refreshTokenService.issue({
			userId: user.id,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return { ...tokens, user: this.excludePassword(user), refresh };
	}

	// ─── Google ─────────────────────────────────────────────────────────────

	async googleLogin(
		googleUser: GoogleStrategyUser,
		ctx: AuthRequestContext = EMPTY_CONTEXT,
	): Promise<OAuthLoginResult> {
		const normalizedUser: BaseOAuthUser = {
			id: googleUser.googleId,
			email: googleUser.email,
			name: googleUser.name,
			provider: 'google',
		};
		return this.handleOAuthLogin(normalizedUser, googleUser.googleId, 'oauthId', ctx);
	}

	// ─── Apple ──────────────────────────────────────────────────────────────

	async appleLogin(
		appleUser: AppleStrategyUser,
		ctx: AuthRequestContext = EMPTY_CONTEXT,
	): Promise<OAuthLoginResult> {
		const normalizedUser: BaseOAuthUser = {
			id: appleUser.appleId,
			email: appleUser.email,
			name: appleUser.name,
			provider: 'apple',
		};
		return this.handleOAuthLogin(normalizedUser, appleUser.appleId, 'appleId', ctx);
	}

	// ─── X ──────────────────────────────────────────────────────────────────

	async xLogin(
		xUser: XStrategyUser,
		ctx: AuthRequestContext = EMPTY_CONTEXT,
	): Promise<OAuthLoginResult> {
		const normalizedUser: BaseOAuthUser = {
			id: xUser.xId,
			email: xUser.email,
			name: xUser.name,
			provider: 'x',
		};
		return this.handleOAuthLogin(normalizedUser, xUser.xId, 'xId', ctx);
	}

	// ─── state 由来登録（OAuth 順序逆転新フロー）──────────────────────────────
	// state 検証は `InvitationStateService` が AuthController 層で完了している前提。
	// 再検証 → 新規ユーザー作成 → 招待コード消費 → token 発行までを一括で行う。

	private async consumeAndIssue(
		oauthUser: BaseOAuthUser,
		providerId: string,
		providerField: UserProviderField,
		invitationCode: string,
		fallbackEmail: string | undefined,
		ctx: AuthRequestContext,
	): Promise<OAuthLoginResult> {
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
		// TODO(comp-perk-apply): 後続 spec で PerkGate.applyPerk を配線

		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);
		const refresh = await this.refreshTokenService.issue({
			userId: user.id,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return { ...tokens, user: this.excludePassword(user), refresh };
	}

	async googleRegisterWithStateInvitation(
		args: OAuthRegisterArgs<GoogleStrategyUser>,
	): Promise<OAuthLoginResult> {
		const normalizedUser: BaseOAuthUser = {
			id: args.oauthUser.googleId,
			email: args.oauthUser.email,
			name: args.oauthUser.name,
			provider: 'google',
		};
		return this.consumeAndIssue(
			normalizedUser,
			args.oauthUser.googleId,
			'oauthId',
			args.invitationCode,
			undefined,
			args.ctx,
		);
	}

	async appleRegisterWithStateInvitation(args: AppleOAuthRegisterArgs): Promise<OAuthLoginResult> {
		const normalizedUser: BaseOAuthUser = {
			id: args.oauthUser.appleId,
			email: args.oauthUser.email,
			name: args.oauthUser.name,
			provider: 'apple',
		};
		return this.consumeAndIssue(
			normalizedUser,
			args.oauthUser.appleId,
			'appleId',
			args.invitationCode,
			args.fallbackEmail,
			args.ctx,
		);
	}

	async xRegisterWithStateInvitation(
		args: OAuthRegisterArgs<XStrategyUser>,
	): Promise<OAuthLoginResult> {
		const normalizedUser: BaseOAuthUser = {
			id: args.oauthUser.xId,
			email: args.oauthUser.email,
			name: args.oauthUser.name,
			provider: 'x',
		};
		return this.consumeAndIssue(
			normalizedUser,
			args.oauthUser.xId,
			'xId',
			args.invitationCode,
			undefined,
			args.ctx,
		);
	}
}
