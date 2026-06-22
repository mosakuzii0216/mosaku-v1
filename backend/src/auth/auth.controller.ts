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
} from './oauth-auth.guards';
import { XRegisterStartGuard } from './x-register-start.guard';
import { InvitationStateInvalidFilter } from './x-register-start.filter';
import { Public } from '../common/decorators/public.decorator';
import { AuthService, type AuthLoginResult, type AuthRequestContext } from './auth.service';
import { OAuthService, type OAuthLoginResult } from './oauth.service';
import { InvitationService } from '../invitation/invitation.service';
import { OAuthStateService, type OAuthStatePayload } from './oauth-state.service';
import { XOAuthService } from './x-oauth.service';
import { generatePkcePair } from './pkce-codec';
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
		private readonly oauthStateService: OAuthStateService,
		private readonly xOAuthService: XOAuthService,
		private readonly passwordResetService: PasswordResetService,
	) {
		this.logger.setContext('AuthController');
	}

	/**
	 * 5 プロバイダ統一の OAuth 開始エンドポイント。
	 * 招待コードを事前検証し、署名 state を発行してプロバイダへリダイレクトする URL を返す。
	 * X は PKCE pair を生成して verifier を state に封緘し、4 社は従来どおり code のみ。
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

		let authorizationUrl: string;

		if (params.provider === 'x') {
			const pkce = generatePkcePair();
			const signedState = this.oauthStateService.issueState({
				provider: 'x',
				code: body.invitationCode,
				verifier: pkce.verifier,
			});
			authorizationUrl = this.configService.generateOAuthAuthorizationUrl(
				'x',
				signedState,
				pkce.challenge,
			);
		} else {
			const signedState = this.oauthStateService.issueState({
				provider: params.provider,
				code: body.invitationCode,
			});
			authorizationUrl = this.configService.generateOAuthAuthorizationUrl(
				params.provider,
				signedState,
			);
		}

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
	 * 共通コールバック finalize。`payload.code` の有無で招待登録/ログインを選び、
	 * refresh cookie 設定・MCP ハンドオフ・成功 redirect を行う（プロバイダ分岐なし）。
	 * MCP ハンドオフのみ session を読み書きするが、OAuth 認証成立はその成否に非依存。
	 */
	private async finalizeOAuthCallback<TUser extends OAuthStrategyUser>(
		payload: OAuthStatePayload | null,
		user: TUser,
		loginFn: (user: TUser, ctx: AuthRequestContext) => Promise<OAuthLoginResult>,
		registerFn: (
			args: OAuthRegisterArgs<TUser> & { fallbackEmail?: string },
		) => Promise<OAuthLoginResult>,
		req: ExpressRequest,
		res: ExpressResponse,
		providerName: string,
	): Promise<void> {
		try {
			const ctx = this.extractRequestContext(req);
			let result: OAuthLoginResult;

			if (payload?.code) {
				result = await registerFn({ oauthUser: user, invitationCode: payload.code, ctx });
			} else {
				result = await loginFn(user, ctx);
			}

			this.refreshCookieHelper.setRefreshCookie(
				res,
				result.refresh.plainRt,
				result.refresh.expiresAt,
			);

			// MCP 認可フロー専用ハンドオフ（OAuth 認証成立はこの session 書き込みに非依存）
			const mcpSession = req.session as unknown as
				| { mcpAuthorizeReturn?: string; mcpUserId?: string }
				| undefined;
			if (mcpSession?.mcpAuthorizeReturn) {
				const returnTo = mcpSession.mcpAuthorizeReturn;
				mcpSession.mcpAuthorizeReturn = undefined;
				mcpSession.mcpUserId = result.user.id;
				return res.redirect(returnTo);
			}

			return res.redirect(
				this.configService.generateSuccessRedirectUrl(result.accessToken, result.user),
			);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const failureCode = error instanceof AppException ? error.code : 'unknown';
			this.logger.error(`${providerName} auth error: ${errorMessage}`);

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

	/**
	 * state 検証込みの OAuth コールバック dispatcher（4 社向け）。
	 * state があれば OAuthStateService で検証し finalizeOAuthCallback（登録経路）へ。
	 * state なしは finalizeOAuthCallback（ログイン経路）へ。
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
			let payload: OAuthStatePayload;
			try {
				payload = this.oauthStateService.verifyState(stateValue, provider);
			} catch (error: unknown) {
				const failureCode = error instanceof AppException ? error.code : 'unknown';
				const invitationCode = this.oauthStateService.tryExtractInvitationCode(stateValue) ?? '';

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
				return res.redirect(this.configService.generateInvitationStateInvalidUrl(invitationCode));
			}

			return this.finalizeOAuthCallback(
				payload,
				req.user,
				loginMethod,
				stateRegister,
				req,
				res,
				providerName,
			);
		}

		return this.finalizeOAuthCallback(
			null,
			req.user,
			loginMethod,
			stateRegister,
			req,
			res,
			providerName,
		);
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

			const isCurrentPasswordValid = await this.authService.comparePassword(
				currentPassword,
				user.password,
			);

			if (!isCurrentPasswordValid) {
				throwUnauthorized(ERROR_CODES.AUTH.INVALID_PASSWORD);
			}

			const hashedNewPassword = await this.authService.hashPassword(newPassword);
			await this.prisma.user.update({
				where: { id: userId },
				data: { password: hashedNewPassword },
			});

			await this.refreshTokenService.revokeAllForUser(userId, 'password_change');
			this.refreshCookieHelper.clearRefreshCookie(res);

			return { message: 'Password changed successfully' };
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Failed to change password';
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT, message);
		}
	}

	@Post('update-admin-role')
	@UseGuards(JwtAuthGuard)
	async updateAdminRole(@Request() req: AuthenticatedRequest) {
		const currentUser = req.user;

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

	// X OAuth エンドポイント（手組みステートレスフロー）

	/**
	 * X 通常ログイン開始。passport guard を廃し、PKCE pair 生成 → 署名 state 発行 →
	 * X authorize へ 302。verifier は state 内（AEAD 暗号化）にのみ保持し session には保存しない。
	 */
	@Public()
	@Get('x')
	async xAuth(@Response() res: ExpressResponse): Promise<void> {
		if (!this.xOAuthService.isConfigured()) {
			res.status(503).json({ message: 'X OAuth provider is not configured' });
			return;
		}
		const pkce = generatePkcePair();
		const signedState = this.oauthStateService.issueState({
			provider: 'x',
			verifier: pkce.verifier,
		});
		const authorizationUrl = this.configService.generateOAuthAuthorizationUrl(
			'x',
			signedState,
			pkce.challenge,
		);
		res.redirect(authorizationUrl);
	}

	/**
	 * X 招待登録の開始エンドポイント（legacy session 経路）。
	 * Phase 3 で撤去予定。XRegisterStartGuard が session に招待コードを格納し passport へ委譲。
	 */
	@Public()
	@Get('x/register-start')
	@UseGuards(XRegisterStartGuard)
	@UseFilters(InvitationStateInvalidFilter)
	xRegisterStart(@Request() _req: ExpressRequest) {
		// XRegisterStartGuard が session セット + passport へ委譲してリダイレクト
	}

	/**
	 * X コールバック（手組みステートレスフロー）。
	 * verifyState → token/profile 交換 → finalizeOAuthCallback で処理。
	 * session には一切触れない（認証成立に非依存）。
	 */
	@Public()
	@Get('x/callback')
	async xAuthCallback(
		@Request() req: ExpressRequest,
		@Response() res: ExpressResponse,
	): Promise<void> {
		const stateValue = this.extractStateFromRequest(req);
		const code = (req.query as Record<string, unknown>).code;

		if (!stateValue || typeof code !== 'string' || code.length === 0) {
			res.redirect(this.configService.generateAuthFailedUrl());
			return;
		}

		let payload: OAuthStatePayload;
		try {
			payload = this.oauthStateService.verifyState(stateValue, 'x');
		} catch (error: unknown) {
			const failureCode = error instanceof AppException ? error.code : 'unknown';
			const invitationCode = this.oauthStateService.tryExtractInvitationCode(stateValue) ?? '';

			try {
				Sentry.captureMessage('invitation_state_invalid', {
					level: 'warning',
					tags: { feature_area: 'invitation', invitation_failure_code: failureCode },
				});
			} catch (sentryError) {
				this.logger.warn(
					`Sentry captureMessage failed: ${sentryError instanceof Error ? sentryError.message : String(sentryError)}`,
				);
			}

			this.logger.warn(
				`X OAuth state invalid: ${error instanceof Error ? error.message : String(error)}`,
			);

			if (invitationCode) {
				res.redirect(this.configService.generateInvitationStateInvalidUrl(invitationCode));
			} else {
				res.redirect(this.configService.generateAuthFailedUrl());
			}
			return;
		}

		if (!payload.verifier) {
			this.logger.error('X callback: state missing PKCE verifier');
			res.redirect(this.configService.generateAuthFailedUrl());
			return;
		}

		let xUser: XStrategyUser;
		try {
			xUser = await this.xOAuthService.exchangeCodeForUser({
				code,
				verifier: payload.verifier,
			});
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`X token/profile exchange failed: ${errorMessage}`);
			res.redirect(this.configService.generateAuthFailedUrl());
			return;
		}

		return this.finalizeOAuthCallback(
			payload,
			xUser,
			(user, ctx) => this.oauthService.xLogin(user, ctx),
			(args) => this.oauthService.xRegisterWithStateInvitation(args),
			req,
			res,
			'X',
		);
	}
}
