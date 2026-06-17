import {
	Controller,
	Post,
	Body,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	UseFilters,
	UseGuards,
	Request,
	Response,
	Req,
} from '@nestjs/common';
import {
	ERROR_CODES,
	throwBadRequest,
	throwUnauthorized,
	throwNotFound,
} from '../common/exceptions';
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { AuthenticatedRequest, OAuthRequest } from './types';
import type {
	GitHubStrategyUser,
	GoogleStrategyUser,
	LineStrategyUser,
	AppleStrategyUser,
	XStrategyUser,
	OAuthStrategyUser,
	OAuthProvider,
} from './types/oauth.types';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
	GoogleAuthGuard,
	GitHubAuthGuard,
	LineAuthGuard,
	AppleAuthGuard,
	XAuthGuard,
} from './oauth-auth.guards';
import { XRegisterStartGuard } from './x-register-start.guard';
import { InvitationStateInvalidFilter } from './x-register-start.filter';
import { Public } from '../common/decorators/public.decorator';
import { AuthService, type AuthLoginResult, type AuthRequestContext } from './auth.service';
import { OAuthService, type OAuthLoginResult } from './oauth.service';
import { InvitationService } from '../invitation/invitation.service';
import { InvitationStateService } from './invitation-state.service';
import {
	OAuthStartBodyDto,
	OAuthStartParamsDto,
	type OAuthStartResponse,
} from './dto/oauth-start.dto';
import { RegisterUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import {
	ResetPasswordRequestDto,
	ResetPasswordDto,
	ChangePasswordDto,
} from './dto/reset-password.dto';
import { THROTTLE_CONFIG, REFRESH_COOKIE_NAME } from '../config/auth-constants';
import { PasswordResetService } from './password-reset.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { JwtTokenService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { RefreshCsrfGuard } from './refresh-csrf.guard';
import * as Sentry from '@sentry/nestjs';
import { AppException } from '../common/exceptions/app.exception';
import type { OAuthRegisterArgs } from './oauth.service';

@Controller('auth')
export class AuthController {
	private readonly logger = new AppLogger();

	constructor(
		private readonly prisma: PrismaService,
		private readonly authService: AuthService,
		private readonly oauthService: OAuthService,
		private readonly configService: ConfigService,
		private readonly jwtTokenService: JwtTokenService,
		private readonly refreshTokenService: RefreshTokenService,
		private readonly refreshCookieHelper: RefreshCookieHelper,
		private readonly invitationService: InvitationService,
		private readonly invitationStateService: InvitationStateService,
		private readonly passwordResetService: PasswordResetService,
	) {
		this.logger.setContext('AuthController');
	}

	/**
	 * Task 5.3: 5 プロバイダ統一の OAuth 開始エンドポイント。
	 * 招待コードを開始前に検証し、HMAC 署名 state を passport の state 機構の代わりに渡す。
	 */
	@Public()
	@Throttle({
		default: { limit: THROTTLE_CONFIG.LOGIN.LIMIT, ttl: THROTTLE_CONFIG.LOGIN.TTL },
	})
	@HttpCode(HttpStatus.OK)
	@Post('oauth/:provider/start')
	async startOAuthRegistration(
		@Param() params: OAuthStartParamsDto,
		@Body() body: OAuthStartBodyDto,
	): Promise<OAuthStartResponse> {
		await this.invitationService.verifyInvitation(body.invitationCode);

		const signedState = this.invitationStateService.issueState(
			body.invitationCode,
			params.provider,
		);

		// X は passport PKCE/state 方式のため、backend の register-start 経路 URL を返す（ダミー PKCE 撤去）。
		// 他 4 社はステートレス HMAC 署名 state でプロバイダへ直接リダイレクト。
		const authorizationUrl =
			params.provider === 'x'
				? this.configService.generateXRegisterStartUrl(signedState)
				: this.configService.generateOAuthAuthorizationUrl(params.provider, signedState);

		return { authorizationUrl };
	}

	private extractRequestContext(req: ExpressRequest): AuthRequestContext {
		const ip = req.ip ?? null;
		const uaHeader = req.headers['user-agent'];
		const userAgent = typeof uaHeader === 'string' ? uaHeader.slice(0, 512) : null;
		return { ip, userAgent };
	}

	private readRefreshCookie(req: ExpressRequest): string | null {
		const cookies = (req as ExpressRequest & { cookies?: Record<string, string> }).cookies;
		const value = cookies?.[REFRESH_COOKIE_NAME];
		return typeof value === 'string' && value.length > 0 ? value : null;
	}

	/**
	 * Task 5.4: state 検証込みの OAuth コールバック dispatcher。
	 * state が `req.query.state` または `req.body.state` に存在すれば
	 * `InvitationStateService.verifyState` を実行し、成功時のみ
	 * `*RegisterWithStateInvitation` 経路で新規登録 + 自動ログインを行う。
	 * state なしは既存ログイン経路（旧フロー）にそのまま委譲する。
	 */
	private async runOAuthCallbackWithStateSupport<TUser extends OAuthStrategyUser>(
		provider: OAuthProvider,
		loginMethod: (user: TUser, ctx: AuthRequestContext) => Promise<OAuthLoginResult>,
		stateRegister: (
			args: OAuthRegisterArgs<TUser> & { fallbackEmail?: string },
		) => Promise<OAuthLoginResult>,
		req: OAuthRequest<TUser>,
		res: ExpressResponse,
		providerName: string,
	): Promise<void> {
		const stateValue = this.extractStateFromRequest(req);

		if (stateValue !== null) {
			try {
				const payload = this.invitationStateService.verifyState(stateValue, provider);
				const ctx = this.extractRequestContext(req);
				const result = await stateRegister({
					oauthUser: req.user,
					invitationCode: payload.code,
					ctx,
				});

				this.refreshCookieHelper.setRefreshCookie(
					res,
					result.refresh.plainRt,
					result.refresh.expiresAt,
				);

				const redirectUrl = this.configService.generateSuccessRedirectUrl(
					result.accessToken,
					result.user,
				);
				return res.redirect(redirectUrl);
			} catch (error: unknown) {
				const failureCode = error instanceof AppException ? error.code : 'unknown';
				const invitationCode = this.tryExtractInvitationCodeFromState(stateValue) ?? '';

				try {
					Sentry.captureMessage('invitation_state_invalid', {
						level: 'warning',
						tags: {
							feature_area: 'invitation',
							invitation_failure_code: failureCode,
						},
					});
				} catch (sentryError) {
					this.logger.warn(
						`Sentry captureMessage failed: ${sentryError instanceof Error ? sentryError.message : String(sentryError)}`,
					);
				}

				this.logger.warn(
					`${providerName} OAuth state invalid: ${error instanceof Error ? error.message : String(error)}`,
				);

				const invalidStateUrl =
					this.configService.generateInvitationStateInvalidUrl(invitationCode);
				return res.redirect(invalidStateUrl);
			}
		}

		return this.handleOAuthCallback(loginMethod, req, res, providerName);
	}

	private extractStateFromRequest(req: ExpressRequest): string | null {
		const queryState = (req.query as Record<string, unknown> | undefined)?.state;
		if (typeof queryState === 'string' && queryState.length > 0) {
			return queryState;
		}

		const bodyState = (req.body as Record<string, unknown> | undefined)?.state;
		if (typeof bodyState === 'string' && bodyState.length > 0) {
			return bodyState;
		}

		return null;
	}

	private tryExtractInvitationCodeFromState(state: string): string | null {
		const separatorIndex = state.indexOf('.');
		if (separatorIndex <= 0) {
			return null;
		}

		try {
			const encodedPayload = state.slice(0, separatorIndex);
			const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
			const parsed: unknown = JSON.parse(json);
			if (
				parsed &&
				typeof parsed === 'object' &&
				typeof (parsed as { code?: unknown }).code === 'string'
			) {
				return (parsed as { code: string }).code;
			}
			return null;
		} catch {
			return null;
		}
	}

	/**
	 * OAuth認証コールバック共通処理
	 */
	private async handleOAuthCallback<TUser extends OAuthStrategyUser>(
		authMethod: (user: TUser, ctx: AuthRequestContext) => Promise<OAuthLoginResult>,
		req: OAuthRequest<TUser>,
		res: ExpressResponse,
		providerName: string,
	): Promise<void> {
		try {
			const ctx = this.extractRequestContext(req);
			const result = await authMethod(req.user, ctx);

			this.refreshCookieHelper.setRefreshCookie(
				res,
				result.refresh.plainRt,
				result.refresh.expiresAt,
			);

			// MCP 認可フロー: セッションに戻り先 URL があれば consent ページへリダイレクト。
			// ソーシャルログイン完了後に mcpUserId を注入して authorize に戻す（design 4.3）。
			const mcpSession = req.session as unknown as
				| { mcpAuthorizeReturn?: string; mcpUserId?: string }
				| undefined;
			if (mcpSession?.mcpAuthorizeReturn) {
				const returnTo = mcpSession.mcpAuthorizeReturn;
				mcpSession.mcpAuthorizeReturn = undefined;
				mcpSession.mcpUserId = result.user.id;
				return res.redirect(returnTo);
			}

			// フロントエンドにトークンを渡すため、URLパラメータとしてリダイレクト
			const redirectUrl = this.configService.generateSuccessRedirectUrl(
				result.accessToken,
				result.user,
			);

			return res.redirect(redirectUrl);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const failureCode = error instanceof AppException ? error.code : 'unknown';
			this.logger.error(`${providerName} auth error: ${errorMessage}`);

			try {
				Sentry.captureMessage('oauth_callback_failed', {
					level: 'warning',
					tags: {
						feature_area: 'invitation',
						invitation_failure_code: failureCode,
					},
				});
			} catch (sentryError) {
				this.logger.warn(
					`Sentry captureMessage failed: ${sentryError instanceof Error ? sentryError.message : String(sentryError)}`,
				);
			}

			const errorUrl = this.configService.generateAuthFailedUrl();
			return res.redirect(errorUrl);
		}
	}

	@Public()
	@Throttle({
		default: { limit: THROTTLE_CONFIG.REGISTER.LIMIT, ttl: THROTTLE_CONFIG.REGISTER.TTL },
	})
	@Post('register')
	async register(
		@Body() registerUserDto: RegisterUserDto,
		@Req() req: ExpressRequest,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const { email, password, name, invitationCode } = registerUserDto;

		try {
			const ctx = this.extractRequestContext(req);
			const result = await this.authService.registerWithTokens(
				email,
				password,
				name,
				invitationCode,
				ctx,
			);

			this.refreshCookieHelper.setRefreshCookie(
				res,
				result.refresh.plainRt,
				result.refresh.expiresAt,
			);

			return this.buildAuthResponse(result, 'Registration successful');
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Registration failed';
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT, message);
		}
	}

	@Public()
	@Throttle({ default: { limit: THROTTLE_CONFIG.LOGIN.LIMIT, ttl: THROTTLE_CONFIG.LOGIN.TTL } })
	@Post('login')
	async login(
		@Body() loginDto: LoginDto,
		@Req() req: ExpressRequest,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const { email, password } = loginDto;

		try {
			const ctx = this.extractRequestContext(req);
			const result = await this.authService.login(email, password, ctx);

			this.refreshCookieHelper.setRefreshCookie(
				res,
				result.refresh.plainRt,
				result.refresh.expiresAt,
			);

			return this.buildAuthResponse(result, 'Login successful');
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Login failed';
			throwUnauthorized(ERROR_CODES.AUTH.INVALID_CREDENTIALS, message);
		}
	}

	@Public()
	@UseGuards(RefreshCsrfGuard)
	@Throttle({
		default: { limit: THROTTLE_CONFIG.REFRESH.LIMIT, ttl: THROTTLE_CONFIG.REFRESH.TTL },
	})
	@HttpCode(HttpStatus.OK)
	@Post('refresh')
	async refresh(@Req() req: ExpressRequest, @Response({ passthrough: true }) res: ExpressResponse) {
		const plainRt = this.readRefreshCookie(req);
		if (!plainRt) {
			throwUnauthorized(ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID);
		}

		const ctx = this.extractRequestContext(req);
		const rotated = await this.refreshTokenService.rotate({
			plainRt,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});

		const user = await this.authService.findUserById(rotated.userId);
		const tokens = this.jwtTokenService.generateTokens(user.id, user.email, user.role);

		this.refreshCookieHelper.setRefreshCookie(res, rotated.plainRt, rotated.expiresAt);

		return {
			accessToken: tokens.accessToken,
			user,
		};
	}

	@Public()
	@UseGuards(RefreshCsrfGuard)
	@Throttle({
		default: { limit: THROTTLE_CONFIG.REFRESH.LIMIT, ttl: THROTTLE_CONFIG.REFRESH.TTL },
	})
	@HttpCode(HttpStatus.OK)
	@Post('logout')
	async logout(@Req() req: ExpressRequest, @Response({ passthrough: true }) res: ExpressResponse) {
		const plainRt = this.readRefreshCookie(req);
		if (plainRt) {
			await this.refreshTokenService.revoke(plainRt);
		}

		this.refreshCookieHelper.clearRefreshCookie(res);

		return { message: 'Logout successful' };
	}

	private buildAuthResponse(result: AuthLoginResult | OAuthLoginResult, message: string) {
		return {
			message,
			accessToken: result.accessToken,
			user: result.user,
		};
	}

	@Get('me')
	@UseGuards(JwtAuthGuard)
	async getMe(@Request() req: AuthenticatedRequest) {
		const userId = req.user.id;

		const user = await this.authService.findUserById(userId);
		if (!user) {
			throwNotFound(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		// 既存ユーザーの管理者権限を確認・更新
		const adminEmail = this.configService.adminEmail;
		const shouldBeAdmin = adminEmail && user.email === adminEmail;

		if (shouldBeAdmin && user.role !== 'ADMIN') {
			const updatedUser = await this.prisma.user.update({
				where: { id: user.id },
				data: { role: 'ADMIN' },
			});
			return updatedUser;
		}

		return user;
	}

	@Public()
	@Throttle({
		default: {
			limit: THROTTLE_CONFIG.PASSWORD_RESET.LIMIT,
			ttl: THROTTLE_CONFIG.PASSWORD_RESET.TTL,
		},
	})
	@HttpCode(HttpStatus.OK)
	@Post('reset-password')
	async resetPassword(@Body() resetPasswordRequestDto: ResetPasswordRequestDto) {
		await this.passwordResetService.requestReset(resetPasswordRequestDto.email);
		return { message: 'パスワードリセットリンクをお送りしました。メールをご確認ください。' };
	}

	@Public()
	@Throttle({
		default: {
			limit: THROTTLE_CONFIG.PASSWORD_RESET.LIMIT,
			ttl: THROTTLE_CONFIG.PASSWORD_RESET.TTL,
		},
	})
	@HttpCode(HttpStatus.OK)
	@Post('reset-password/confirm')
	async resetPasswordConfirm(@Body() resetPasswordDto: ResetPasswordDto) {
		await this.passwordResetService.confirmReset(
			resetPasswordDto.token,
			resetPasswordDto.newPassword,
		);
		return { message: 'パスワードを再設定しました' };
	}

	@Post('change-password')
	@UseGuards(JwtAuthGuard)
	async changePassword(
		@Request() req: AuthenticatedRequest,
		@Body() changePasswordDto: ChangePasswordDto,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const userId = req.user.id;
		const { currentPassword, newPassword } = changePasswordDto;

		try {
			const user = await this.prisma.user.findUnique({
				where: { id: userId },
			});

			if (!user || !user.password) {
				throwBadRequest(ERROR_CODES.AUTH.PASSWORD_NOT_SET);
			}

			// 現在のパスワードを検証
			const isCurrentPasswordValid = await this.authService.comparePassword(
				currentPassword,
				user.password,
			);

			if (!isCurrentPasswordValid) {
				throwUnauthorized(ERROR_CODES.AUTH.INVALID_PASSWORD);
			}

			// 新しいパスワードをハッシュ化して更新
			const hashedNewPassword = await this.authService.hashPassword(newPassword);
			await this.prisma.user.update({
				where: { id: userId },
				data: { password: hashedNewPassword },
			});

			await this.refreshTokenService.revokeAllForUser(userId, 'password_change');
			this.refreshCookieHelper.clearRefreshCookie(res);

			return {
				message: 'Password changed successfully',
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Failed to change password';
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT, message);
		}
	}

	@Post('update-admin-role')
	@UseGuards(JwtAuthGuard)
	async updateAdminRole(@Request() req: AuthenticatedRequest) {
		const currentUser = req.user;

		// 管理者メールアドレスかどうかをチェック
		const shouldBeAdmin = this.configService.isAdminEmail(currentUser.email);

		if (!shouldBeAdmin) {
			throwBadRequest(ERROR_CODES.AUTHZ.ADMIN_EMAIL_REQUIRED);
		}

		const user = await this.prisma.user.findUnique({
			where: { id: currentUser.id },
		});

		if (!user) {
			throwNotFound(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		const updatedUser = await this.prisma.user.update({
			where: { id: user.id },
			data: { role: 'ADMIN' },
		});

		return {
			message: 'Admin role updated successfully',
			user: updatedUser,
		};
	}

	// Google OAuth エンドポイント
	@Public()
	@Get('google')
	@UseGuards(GoogleAuthGuard)
	googleAuth(@Request() _req: ExpressRequest) {
		// Google認証画面にリダイレクト
	}

	@Public()
	@Get('google/callback')
	@UseGuards(GoogleAuthGuard)
	async googleAuthRedirect(
		@Request() req: OAuthRequest<GoogleStrategyUser>,
		@Response() res: ExpressResponse,
	) {
		return this.runOAuthCallbackWithStateSupport<GoogleStrategyUser>(
			'google',
			(user, ctx) => this.oauthService.googleLogin(user, ctx),
			(args) => this.oauthService.googleRegisterWithStateInvitation(args),
			req,
			res,
			'Google',
		);
	}

	// GitHub OAuth エンドポイント
	@Public()
	@Get('github')
	@UseGuards(GitHubAuthGuard)
	githubAuth(@Request() _req: ExpressRequest) {
		// GitHub認証画面にリダイレクト
	}

	@Public()
	@Get('github/callback')
	@UseGuards(GitHubAuthGuard)
	async githubAuthRedirect(
		@Request() req: OAuthRequest<GitHubStrategyUser>,
		@Response() res: ExpressResponse,
	) {
		return this.runOAuthCallbackWithStateSupport<GitHubStrategyUser>(
			'github',
			(user, ctx) => this.oauthService.githubLogin(user, ctx),
			(args) => this.oauthService.githubRegisterWithStateInvitation(args),
			req,
			res,
			'GitHub',
		);
	}

	// LINE OAuth エンドポイント
	@Public()
	@Get('line')
	@UseGuards(LineAuthGuard)
	lineAuth(@Request() _req: ExpressRequest) {
		// LINE認証画面にリダイレクト
	}

	@Public()
	@Get('line/callback')
	@UseGuards(LineAuthGuard)
	async lineAuthCallback(
		@Request() req: OAuthRequest<LineStrategyUser>,
		@Response() res: ExpressResponse,
	) {
		return this.runOAuthCallbackWithStateSupport<LineStrategyUser>(
			'line',
			(user, ctx) => this.oauthService.lineLogin(user, ctx),
			(args) => this.oauthService.lineRegisterWithStateInvitation(args),
			req,
			res,
			'LINE',
		);
	}

	// Apple OAuth エンドポイント
	@Public()
	@Get('apple')
	@UseGuards(AppleAuthGuard)
	appleAuth(@Request() _req: ExpressRequest) {
		// Apple認証画面にリダイレクト
	}

	@Public()
	@Post('apple/callback')
	@UseGuards(AppleAuthGuard)
	async appleAuthCallback(
		@Request() req: OAuthRequest<AppleStrategyUser>,
		@Response() res: ExpressResponse,
	) {
		return this.runOAuthCallbackWithStateSupport<AppleStrategyUser>(
			'apple',
			(user, ctx) => this.oauthService.appleLogin(user, ctx),
			(args) => this.oauthService.appleRegisterWithStateInvitation(args),
			req,
			res,
			'Apple',
		);
	}

	// X OAuth エンドポイント
	@Public()
	@Get('x')
	@UseGuards(XAuthGuard)
	xAuth(@Request() _req: ExpressRequest) {
		// X認証画面にリダイレクト（passport が twitter へ 302）
	}

	/**
	 * X 招待登録の開始エンドポイント（Task 2.1）。
	 * XRegisterStartGuard が招待署名 state を検証し、
	 * session に招待コードを格納してから passport（twitter）へリダイレクトする。
	 * state 不正時は InvitationStateInvalidFilter が invite ページへリダイレクト。
	 */
	@Public()
	@Get('x/register-start')
	@UseGuards(XRegisterStartGuard)
	@UseFilters(InvitationStateInvalidFilter)
	xRegisterStart(@Request() _req: ExpressRequest) {
		// XRegisterStartGuard が session セット + passport へ委譲してリダイレクト
	}

	/**
	 * X コールバック（Task 2.2）。
	 * passport が CSRF state / PKCE verifier を cookie-session から検証済の前提で req.user を受領。
	 * session の xInvitationCode 有無で招待登録 / 通常ログインに分岐する。
	 * runOAuthCallbackWithStateSupport は使わない（passport のランダム state を verifyState に渡さない）。
	 */
	@Public()
	@Get('x/callback')
	@UseGuards(XAuthGuard)
	async xAuthCallback(
		@Request() req: OAuthRequest<XStrategyUser>,
		@Response() res: ExpressResponse,
	) {
		return this.handleXCallback(req, res);
	}

	private async handleXCallback(
		req: OAuthRequest<XStrategyUser>,
		res: ExpressResponse,
	): Promise<void> {
		try {
			const ctx = this.extractRequestContext(req);
			// cookie-session は req.session を Record<string, unknown> として扱う。
			// express-session の型定義と不一致のため unknown を経由してキャスト。
			const session = req.session as unknown as Record<string, unknown> | undefined;
			const invitationCode = session?.xInvitationCode;
			let result: OAuthLoginResult;

			if (typeof invitationCode === 'string' && invitationCode.length > 0) {
				if (session) delete session.xInvitationCode;
				result = await this.oauthService.xRegisterWithStateInvitation({
					oauthUser: req.user,
					invitationCode,
					ctx,
				});
			} else {
				result = await this.oauthService.xLogin(req.user, ctx);
			}

			this.refreshCookieHelper.setRefreshCookie(
				res,
				result.refresh.plainRt,
				result.refresh.expiresAt,
			);
			const redirectUrl = this.configService.generateSuccessRedirectUrl(
				result.accessToken,
				result.user,
			);
			return res.redirect(redirectUrl);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const failureCode = error instanceof AppException ? error.code : 'unknown';
			this.logger.error(`X auth error: ${errorMessage}`);

			try {
				Sentry.captureMessage('oauth_callback_failed', {
					level: 'warning',
					tags: { feature_area: 'invitation', invitation_failure_code: failureCode },
				});
			} catch (sentryError) {
				this.logger.warn(
					`Sentry captureMessage failed: ${sentryError instanceof Error ? sentryError.message : String(sentryError)}`,
				);
			}

			return res.redirect(this.configService.generateAuthFailedUrl());
		}
	}
}
