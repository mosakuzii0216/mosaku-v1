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
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { InvitationService } from '../invitation/invitation.service';
import { CreateUserDto, RegisterUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import {
  ResetPasswordRequestDto,
  ChangePasswordDto,
} from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly invitationService: InvitationService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() registerUserDto: RegisterUserDto) {
    const { email, password, name, invitationCode } = registerUserDto;

    try {
      // 招待コードを検証
      await this.invitationService.verifyInvitation(invitationCode);

      // ユーザー登録
      const user = await this.authService.register(
        email,
        password,
        name,
        invitationCode,
      );

      // 招待コードの使用回数を増やす
      await this.invitationService.useInvitation(invitationCode);

      return {
        message: 'Registration successful. You can now login.',
        user,
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Registration failed');
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
    } catch (error: any) {
      throw new UnauthorizedException(error.message || 'Login failed');
    }
  }

  @Post('logout')
  @Public()
  async logout(@Request() req: any) {
    // JWTはステートレスなので、ログアウト処理は主にクライアント側で実装
    // 必要に応じてトークンをブラックリストに追加する処理を実装可能
    return {
      message: 'Logout successful',
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    const userId = req.user.id;

    const user = await this.authService.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 既存ユーザーの管理者権限を確認・更新
    const adminEmail = process.env.ADMIN_EMAIL;
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
  async resetPassword(
    @Body() resetPasswordRequestDto: ResetPasswordRequestDto,
  ) {
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
    } catch (error: any) {
      throw new BadRequestException(
        error.message || 'Failed to send password reset email',
      );
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Request() req: any,
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
      const hashedNewPassword =
        await this.authService.hashPassword(newPassword);
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
      });

      return {
        message: 'Password changed successfully',
      };
    } catch (error: any) {
      throw new BadRequestException(
        error.message || 'Failed to change password',
      );
    }
  }

  @Post('update-admin-role')
  @UseGuards(JwtAuthGuard)
  async updateAdminRole(@Request() req: any) {
    const currentUser = req.user;

    // 管理者メールアドレスかどうかをチェック
    const adminEmail = process.env.ADMIN_EMAIL;
    const shouldBeAdmin = adminEmail && currentUser.email === adminEmail;

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
  async syncUser(@Request() req: any, @Body() createUserDto: CreateUserDto) {
    // 新しい認証システムでは不要だが、フロントエンドの移行期間中は保持
    return req.user;
  }

  @Post('sync-user-with-invite')
  @UseGuards(JwtAuthGuard)
  async syncUserWithInvite(
    @Request() req: any,
    @Body() body: { name?: string; invitationCode: string },
  ) {
    // 新しい認証システムでは不要だが、フロントエンドの移行期間中は保持
    return req.user;
  }

  // Google OAuth エンドポイント
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Request() req: any) {
    // Google認証画面にリダイレクト
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Request() req: any, @Response() res: any) {
    try {
      const result = await this.authService.googleLogin(req.user);

      // フロントエンドにトークンを渡すため、URLパラメータとしてリダイレクト
      const redirectUrl = `${process.env.VITE_APP_URL || 'http://localhost'}?token=${result.accessToken}&user=${encodeURIComponent(JSON.stringify(result.user))}`;

      return res.redirect(redirectUrl);
    } catch (error: any) {
      console.error('Google auth error:', error);
      const errorUrl = `${process.env.VITE_APP_URL || 'http://localhost'}?error=auth_failed`;
      return res.redirect(errorUrl);
    }
  }
}
