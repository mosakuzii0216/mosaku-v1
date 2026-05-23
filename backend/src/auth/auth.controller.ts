import { Controller, Post, Body, Get, UseGuards, Request, Response } from '@nestjs/common';
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
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { RegisterUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordRequestDto, ChangePasswordDto } from './dto/reset-password.dto';
import { THROTTLE_CONFIG } from '../config/auth-constants';
import { AppLogger } from '../common/logger/app-logger.service';

@Controller('auth')
export class AuthController {
	private readonly logger = new AppLogger();

	constructor(
		private readonly prisma: PrismaService,
		private readonly authService: AuthService,
		private readonly oauthService: OAuthService,
		private readonly configService: ConfigService,
	) {
		this.logger.setContext('AuthController');
	}

	/**
	 * OAuth認証コールバック共通処理
	 */
	private async handleOAuthCallback<TUser extends OAuthStrategyUser>(
		authMethod: (user: TUser) => Promise<{ accessToken: string; user: unknown }>,
		req: OAuthRequest<TUser>,
		res: ExpressResponse,
		providerName: string,
	): Promise<void> {
		try {
			const result = await authMethod(req.user);

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
	async register(@Body() registerUserDto: RegisterUserDto) {
		const { email, password, name, invitationCode } = registerUserDto;

		try {
			const user = await this.authService.register(email, password, name, invitationCode);

			return {
				message: 'Registration successful. You can now login.',
				user,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Registration failed';
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT, message);
		}
	}

	@Public()
	@Throttle({ default: { limit: THROTTLE_CONFIG.LOGIN.LIMIT, ttl: THROTTLE_CONFIG.LOGIN.TTL } })
	@Post('login')
	async login(@Body() loginDto: LoginDto) {
		const { email, password } = loginDto;

		try {
			const result = await this.authService.login(email, password);
			return {
				message: 'Login successful',
				...result,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Login failed';
			throwUnauthorized(ERROR_CODES.AUTH.INVALID_CREDENTIALS, message);
		}
	}

	@Post('logout')
	@Public()
	logout() {
		// JWTはステートレスなので、ログアウト処理は主にクライアント側で実装
		// 必要に応じてトークンをブラックリストに追加する処理を実装可能
		return {
			message: 'Logout successful',
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
		return this.handleOAuthCallback(
			(user) => this.oauthService.googleLogin(user),
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
		registerMethod: (user: TUser, code: string) => Promise<{ accessToken: string; user: unknown }>,
	) {
		const parsedUser = parser(user);

		try {
			const result = await registerMethod(parsedUser, invitationCode);

			return {
				message: 'Registration successful',
				...result,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Registration failed';
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT, message);
		}
	}

	@Public()
	@Post('google/register-with-invitation')
	async googleRegisterWithInvitation(@Body() body: GoogleRegisterWithInvitationDto) {
		const { googleUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			googleUser,
			invitationCode,
			(value) => this.parseGoogleUser(value),
			(user, code) => this.oauthService.googleRegisterWithInvitation(user, code),
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
		return this.handleOAuthCallback(
			(user) => this.oauthService.githubLogin(user),
			req,
			res,
			'GitHub',
		);
	}

	@Public()
	@Post('github/register-with-invitation')
	async githubRegisterWithInvitation(@Body() body: GithubRegisterWithInvitationDto) {
		const { githubUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			githubUser,
			invitationCode,
			(value) => this.parseGithubUser(value),
			(user, code) => this.oauthService.githubRegisterWithInvitation(user, code),
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
		return this.handleOAuthCallback((user) => this.oauthService.lineLogin(user), req, res, 'LINE');
	}

	@Public()
	@Post('line/register-with-invitation')
	async lineRegisterWithInvitation(@Body() body: LineRegisterWithInvitationDto) {
		const { lineUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			lineUser,
			invitationCode,
			(value) => this.parseLineUser(value),
			(user, code) => this.oauthService.lineRegisterWithInvitation(user, code),
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
		return this.handleOAuthCallback(
			(user) => this.oauthService.appleLogin(user),
			req,
			res,
			'Apple',
		);
	}

	@Public()
	@Post('apple/register-with-invitation')
	async appleRegisterWithInvitation(@Body() body: AppleRegisterWithInvitationDto) {
		const { appleUser, invitationCode, fallbackEmail } = body;
		const parsedUser = this.parseAppleUser(appleUser);

		try {
			const result = await this.oauthService.appleRegisterWithInvitation(
				parsedUser,
				invitationCode,
				fallbackEmail,
			);
			return {
				message: 'Registration successful',
				...result,
			};
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
		return this.handleOAuthCallback((user) => this.oauthService.xLogin(user), req, res, 'X');
	}

	@Public()
	@Post('x/register-with-invitation')
	async xRegisterWithInvitation(@Body() body: XRegisterWithInvitationDto) {
		const { xUser, invitationCode } = body;
		return this.handleOAuthRegisterWithInvitation(
			xUser,
			invitationCode,
			(value) => this.parseXUser(value),
			(user, code) => this.oauthService.xRegisterWithInvitation(user, code),
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
