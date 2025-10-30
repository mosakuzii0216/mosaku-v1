import {
	Controller,
	Post,
	Body,
	Get,
	UseGuards,
	Request,
	Response,
	NotFoundException,
	BadRequestException,
	UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { AuthenticatedRequest } from './types';
import { ConfigService } from '../config/config.service';
import { GoogleRegisterWithInvitationDto } from './dto/google-register-with-invitation.dto';
import { GithubRegisterWithInvitationDto } from './dto/github-register-with-invitation.dto';
import { XRegisterWithInvitationDto } from './dto/x-register-with-invitation.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { GitHubAuthGuard } from './github-auth.guard';
import { XAuthGuard } from './x-auth.guard';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { InvitationService } from '../invitation/invitation.service';
import { CreateUserDto, RegisterUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordRequestDto, ChangePasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
	constructor(
		private readonly prisma: PrismaService,
		private readonly authService: AuthService,
		private readonly invitationService: InvitationService,
		private readonly configService: ConfigService,
	) {}

	/**
	 * OAuth認証コールバック共通処理
	 */
	private async handleOAuthCallback(
		authMethod: (user: unknown) => Promise<{ accessToken: string; user: unknown }>,
		req: ExpressRequest,
		res: ExpressResponse,
		providerName: string,
	): Promise<void> {
		try {
			const result = await authMethod((req as any).user as unknown);

			// フロントエンドにトークンを渡すため、URLパラメータとしてリダイレクト
			const redirectUrl = this.configService.generateSuccessRedirectUrl(
				result.accessToken,
				result.user,
			);

			return res.redirect(redirectUrl);
		} catch (error: unknown) {
			console.error(`${providerName} auth error:`, error);

			// 新規ユーザーで招待コードが必要な場合
			const message = error instanceof Error ? error.message : '';
			if (message.includes('invitation code')) {
				const redirectUrl = this.configService.generateInvitationRequiredUrl(
					providerName,
					(req as any).user,
				);
				return res.redirect(redirectUrl);
			}

			const errorUrl = this.configService.generateAuthFailedUrl();
			return res.redirect(errorUrl);
		}
	}

	@Public()
	@Post('register')
	async register(@Body() registerUserDto: RegisterUserDto) {
		const { email, password, name, invitationCode } = registerUserDto;

		try {
			// 招待コードを検証
			await this.invitationService.verifyInvitation(invitationCode);

			// ユーザー登録
			const user = await this.authService.register(email, password, name, invitationCode);

			// 招待コードの使用回数を増やす
			await this.invitationService.useInvitation(invitationCode);

			return {
				message: 'Registration successful. You can now login.',
				user,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Registration failed';
			throw new BadRequestException(message);
		}
	}

	@Public()
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
			throw new UnauthorizedException(message);
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
			throw new NotFoundException('User not found');
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
			throw new BadRequestException(message);
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
				throw new BadRequestException('User not found or password not set');
			}

			// 現在のパスワードを検証
			const isCurrentPasswordValid = await this.authService.comparePassword(
				currentPassword,
				user.password,
			);

			if (!isCurrentPasswordValid) {
				throw new UnauthorizedException('Current password is incorrect');
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
			throw new BadRequestException(message);
		}
	}

	@Post('update-admin-role')
	@UseGuards(JwtAuthGuard)
	async updateAdminRole(@Request() req: AuthenticatedRequest) {
		const currentUser = req.user;

		// 管理者メールアドレスかどうかをチェック
		const shouldBeAdmin = this.configService.isAdminEmail(currentUser.email);

		if (!shouldBeAdmin) {
			throw new BadRequestException('This email is not authorized as admin');
		}

		const user = await this.prisma.user.findUnique({
			where: { id: currentUser.id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
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

	// 後方互換性のため一時的に保持（将来削除予定）
	@Post('sync-user')
	@UseGuards(JwtAuthGuard)
	syncUser(@Request() req: AuthenticatedRequest) {
		// 新しい認証システムでは不要だが、フロントエンドの移行期間中は保持
		return req.user;
	}

	@Post('sync-user-with-invite')
	@UseGuards(JwtAuthGuard)
	syncUserWithInvite(@Request() req: AuthenticatedRequest) {
		// 新しい認証システムでは不要だが、フロントエンドの移行期間中は保持
		return req.user;
	}

	// Google OAuth エンドポイント
	@Get('google')
	@UseGuards(GoogleAuthGuard)
	googleAuth(@Request() _req: ExpressRequest) {
		// Google認証画面にリダイレクト
	}

	@Get('google/callback')
	@UseGuards(GoogleAuthGuard)
	async googleAuthRedirect(@Request() req: ExpressRequest, @Response() res: ExpressResponse) {
		return this.handleOAuthCallback(
			(user) => this.authService.googleLogin(user),
			req,
			res,
			'Google',
		);
	}

	@Public()
	@Post('google/register-with-invitation')
	async googleRegisterWithInvitation(@Body() body: GoogleRegisterWithInvitationDto) {
		const { googleUser, invitationCode } = body;

		try {
			const result = await this.authService.googleRegisterWithInvitation(
				googleUser,
				invitationCode,
			);

			return {
				message: 'Registration successful',
				...result,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Registration failed';
			throw new BadRequestException(message);
		}
	}

	// GitHub OAuth エンドポイント
	@Get('github')
	@UseGuards(GitHubAuthGuard)
	githubAuth(@Request() _req: ExpressRequest) {
		// GitHub認証画面にリダイレクト
	}

	@Get('github/callback')
	@UseGuards(GitHubAuthGuard)
	async githubAuthRedirect(@Request() req: ExpressRequest, @Response() res: ExpressResponse) {
		return this.handleOAuthCallback(
			(user) => this.authService.githubLogin(user),
			req,
			res,
			'GitHub',
		);
	}

	@Public()
	@Post('github/register-with-invitation')
	async githubRegisterWithInvitation(@Body() body: GithubRegisterWithInvitationDto) {
		const { githubUser, invitationCode } = body;

		try {
			const result = await this.authService.githubRegisterWithInvitation(
				githubUser,
				invitationCode,
			);

			return {
				message: 'Registration successful',
				...result,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Registration failed';
			throw new BadRequestException(message);
		}
	}

	// X OAuth エンドポイント
	@Get('x')
	@UseGuards(XAuthGuard)
	xAuth(@Request() _req: ExpressRequest) {
		// X認証画面にリダイレクト
	}

	@Get('x/callback')
	@UseGuards(XAuthGuard)
	async xAuthRedirect(@Request() req: ExpressRequest, @Response() res: ExpressResponse) {
		return this.handleOAuthCallback((user) => this.authService.xLogin(user), req, res, 'X');
	}

	@Public()
	@Post('x/register-with-invitation')
	async xRegisterWithInvitation(@Body() body: XRegisterWithInvitationDto) {
		const { xUser, invitationCode } = body;

		try {
			const result = await this.authService.xRegisterWithInvitation(xUser, invitationCode);

			return {
				message: 'Registration successful',
				...result,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Registration failed';
			throw new BadRequestException(message);
		}
	}
}
