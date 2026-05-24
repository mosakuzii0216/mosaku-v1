import {
	Controller,
	Post,
	Body,
	Get,
	HttpCode,
	HttpStatus,
	Param,
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
} from './types/oauth.types';
import { ConfigService } from '../config/config.service';
import { GoogleRegisterWithInvitationDto } from './dto/google-register-with-invitation.dto';
import { GithubRegisterWithInvitationDto } from './dto/github-register-with-invitation.dto';
import { LineRegisterWithInvitationDto } from './dto/line-register-with-invitation.dto';
import { AppleRegisterWithInvitationDto } from './dto/apple-register-with-invitation.dto';
import { XRegisterWithInvitationDto } from './dto/x-register-with-invitation.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
	GoogleAuthGuard,
	GitHubAuthGuard,
	LineAuthGuard,
	AppleAuthGuard,
	XAuthGuard,
} from './oauth-auth.guards';
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
import { ResetPasswordRequestDto, ChangePasswordDto } from './dto/reset-password.dto';
import { THROTTLE_CONFIG, REFRESH_COOKIE_NAME } from '../config/auth-constants';
import { AppLogger } from '../common/logger/app-logger.service';
import { JwtTokenService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { RefreshCsrfGuard } from './refresh-csrf.guard';
import * as Sentry from '@sentry/nestjs';
import { AppException } from '../common/exceptions/app.exception';
import type { OAuthProvider } from './types/oauth.types';
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

		const authorizationUrl = this.configService.generateOAuthAuthorizationUrl(
			params.provider,
			signedState,
		);

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

			// フロントエンドにトークンを渡すため、URLパラメータとしてリダイレクト
			const redirectUrl = this.configService.generateSuccessRedirectUrl(
				result.accessToken,
				result.user,
			);

			return res.redirect(redirectUrl);
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`${providerName} auth error: ${errorMessage}`);

			// 新規ユーザーで招待コードが必要な場合
			if (errorMessage.includes('invitation code')) {
				const redirectUrl = this.configService.generateInvitationRequiredUrl(
					providerName,
					req.user,
				);
				return res.redirect(redirectUrl);
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
	@Post('reset-password')
	async resetPassword(@Body() resetPasswordRequestDto: ResetPasswordRequestDto) {
		const { email } = resetPasswordRequestDto;

		try {
			// パスワードリセット機能の実装（メール送信など）
			// 現在は簡単なレスポンスのみ
			const user = await this.prisma.user.findUnique({
				where: { email },
			});

			if (!user) {
				// セキュリティ上、存在しないメールでも成功レスポンスを返す
				return {
					message: 'If the email exists, a password reset link has been sent.',
				};
			}

			// TODO: メール送信機能を実装
			// const resetToken = crypto.randomUUID();
			// await this.prisma.user.update({
			//   where: { id: user.id },
			//   data: {
			//     resetPasswordToken: resetToken,
			//     resetPasswordExpires: new Date(Date.now() + 3600000), // 1時間後
			//   },
			// });

			return {
				message: 'If the email exists, a password reset link has been sent.',
			};
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : 'Failed to send password reset email';
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT, message);
		}
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

	/**
	 * OAuth招待コード登録の共通処理
	 */
	private async handleOAuthRegisterWithInvitation<TUser extends OAuthStrategyUser>(
		user: Record<string, unknown>,
		invitationCode: string,
		parser: (user: Record<string, unknown>) => TUser,
		registerMethod: (
			user: TUser,
			code: string,
			ctx: AuthRequestContext,
		) => Promise<OAuthLoginResult>,
		req: ExpressRequest,
		res: ExpressResponse,
	) {
		const parsedUser = parser(user);

		try {
			const ctx = this.extractRequestContext(req);
			const result = await registerMethod(parsedUser, invitationCode, ctx);

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
	@Post('google/register-with-invitation')
	async googleRegisterWithInvitation(
		@Body() body: GoogleRegisterWithInvitationDto,
		@Req() req: ExpressRequest,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const { googleUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			googleUser,
			invitationCode,
			(value) => this.parseGoogleUser(value),
			(user, code, ctx) => this.oauthService.googleRegisterWithInvitation(user, code, ctx),
			req,
			res,
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

	@Public()
	@Post('github/register-with-invitation')
	async githubRegisterWithInvitation(
		@Body() body: GithubRegisterWithInvitationDto,
		@Req() req: ExpressRequest,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const { githubUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			githubUser,
			invitationCode,
			(value) => this.parseGithubUser(value),
			(user, code, ctx) => this.oauthService.githubRegisterWithInvitation(user, code, ctx),
			req,
			res,
		);
	}

	private parseGoogleUser(value: Record<string, unknown>): GoogleStrategyUser {
		const googleId = value.googleId;
		const name = value.name;
		if (typeof googleId !== 'string' || typeof name !== 'string') {
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_PAYLOAD);
		}

		const email = typeof value.email === 'string' ? value.email : undefined;
		return {
			googleId,
			name,
			email,
			accessToken: typeof value.accessToken === 'string' ? value.accessToken : undefined,
			refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : undefined,
			firstName: typeof value.firstName === 'string' ? value.firstName : undefined,
			lastName: typeof value.lastName === 'string' ? value.lastName : undefined,
			picture: typeof value.picture === 'string' ? value.picture : undefined,
		};
	}

	private parseGithubUser(value: Record<string, unknown>): GitHubStrategyUser {
		const githubId = value.githubId;
		const name = value.name;
		if (typeof githubId !== 'string' || typeof name !== 'string') {
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_PAYLOAD);
		}

		const email = typeof value.email === 'string' ? value.email : undefined;
		return {
			githubId,
			name,
			email,
			username: typeof value.username === 'string' ? value.username : undefined,
			picture: typeof value.picture === 'string' ? value.picture : undefined,
			accessToken: typeof value.accessToken === 'string' ? value.accessToken : undefined,
			refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : undefined,
		};
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

	@Public()
	@Post('line/register-with-invitation')
	async lineRegisterWithInvitation(
		@Body() body: LineRegisterWithInvitationDto,
		@Req() req: ExpressRequest,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const { lineUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			lineUser,
			invitationCode,
			(value) => this.parseLineUser(value),
			(user, code, ctx) => this.oauthService.lineRegisterWithInvitation(user, code, ctx),
			req,
			res,
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

	@Public()
	@Post('apple/register-with-invitation')
	async appleRegisterWithInvitation(
		@Body() body: AppleRegisterWithInvitationDto,
		@Req() req: ExpressRequest,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const { appleUser, invitationCode, fallbackEmail } = body;
		const parsedUser = this.parseAppleUser(appleUser);

		try {
			const ctx = this.extractRequestContext(req);
			const result = await this.oauthService.appleRegisterWithInvitation(
				parsedUser,
				invitationCode,
				fallbackEmail,
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

	// X OAuth エンドポイント
	@Public()
	@Get('x')
	@UseGuards(XAuthGuard)
	xAuth(@Request() _req: ExpressRequest) {
		// X認証画面にリダイレクト
	}

	@Public()
	@Get('x/callback')
	@UseGuards(XAuthGuard)
	async xAuthCallback(
		@Request() req: OAuthRequest<XStrategyUser>,
		@Response() res: ExpressResponse,
	) {
		return this.runOAuthCallbackWithStateSupport<XStrategyUser>(
			'x',
			(user, ctx) => this.oauthService.xLogin(user, ctx),
			(args) => this.oauthService.xRegisterWithStateInvitation(args),
			req,
			res,
			'X',
		);
	}

	@Public()
	@Post('x/register-with-invitation')
	async xRegisterWithInvitation(
		@Body() body: XRegisterWithInvitationDto,
		@Req() req: ExpressRequest,
		@Response({ passthrough: true }) res: ExpressResponse,
	) {
		const { xUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			xUser,
			invitationCode,
			(value) => this.parseXUser(value),
			(user, code, ctx) => this.oauthService.xRegisterWithInvitation(user, code, ctx),
			req,
			res,
		);
	}

	private parseLineUser(value: Record<string, unknown>): LineStrategyUser {
		const lineId = value.lineId;
		const name = value.name;
		if (typeof lineId !== 'string' || typeof name !== 'string') {
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_PAYLOAD);
		}

		return {
			lineId,
			name,
			email: typeof value.email === 'string' ? value.email : undefined,
			picture: typeof value.picture === 'string' ? value.picture : undefined,
			accessToken: typeof value.accessToken === 'string' ? value.accessToken : undefined,
		};
	}

	private parseAppleUser(value: Record<string, unknown>): AppleStrategyUser {
		const appleId = value.appleId;
		const name = value.name;
		if (typeof appleId !== 'string' || typeof name !== 'string') {
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_PAYLOAD);
		}

		return {
			appleId,
			name,
			email: typeof value.email === 'string' ? value.email : undefined,
			accessToken: typeof value.accessToken === 'string' ? value.accessToken : undefined,
		};
	}

	private parseXUser(value: Record<string, unknown>): XStrategyUser {
		const xId = value.xId;
		const name = value.name;
		if (typeof xId !== 'string' || typeof name !== 'string') {
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_PAYLOAD);
		}

		return {
			xId,
			name,
			username: typeof value.username === 'string' ? value.username : undefined,
			email: typeof value.email === 'string' ? value.email : undefined,
			picture: typeof value.picture === 'string' ? value.picture : undefined,
			accessToken: typeof value.accessToken === 'string' ? value.accessToken : undefined,
		};
	}
}
