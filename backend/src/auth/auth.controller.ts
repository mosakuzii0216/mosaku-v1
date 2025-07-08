import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseGuard } from './supabase.guard';
import { CreateUserDto, RegisterUserDto } from './dto/create-user.dto';
import { SupabaseService } from './supabase.service';
import { InvitationService } from '../invitation/invitation.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
    private readonly invitationService: InvitationService,
  ) {}

  @Post('sync-user')
  @UseGuards(SupabaseGuard)
  async syncUser(@Request() req: any, @Body() createUserDto: CreateUserDto) {
    const supabaseUser = req.user;

    const existingUser = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUser.id },
    });

    if (existingUser) {
      return existingUser;
    }

    const newUser = await this.prisma.user.create({
      data: {
        supabaseId: supabaseUser.id,
        email: supabaseUser.email,
        name:
          createUserDto.name ||
          supabaseUser.user_metadata?.full_name ||
          supabaseUser.email,
        role: 'FREE',
      },
    });

    return newUser;
  }

  @Post('sync-user-with-invite')
  @UseGuards(SupabaseGuard)
  async syncUserWithInvite(@Request() req: any, @Body() body: { name?: string; invitationCode: string }) {
    const supabaseUser = req.user;
    const { name, invitationCode } = body;

    const existingUser = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUser.id },
    });

    if (existingUser) {
      return existingUser;
    }

    // 招待コードを検証
    await this.invitationService.verifyInvitation(invitationCode);

    const newUser = await this.prisma.user.create({
      data: {
        supabaseId: supabaseUser.id,
        email: supabaseUser.email,
        name: name || supabaseUser.user_metadata?.full_name || supabaseUser.email,
        role: 'FREE',
      },
    });

    // 招待コードの使用回数を増やす
    await this.invitationService.useInvitation(invitationCode);

    return newUser;
  }

  @Get('me')
  @UseGuards(SupabaseGuard)
  async getMe(@Request() req: any) {
    const supabaseUser = req.user;

    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUser.id },
    });

    if (!user) {
      throw new NotFoundException(
        'User not found. Please sync your account first.',
      );
    }

    return user;
  }

  @Post('register')
  async register(@Body() registerUserDto: RegisterUserDto) {
    const { email, password, name, invitationCode } = registerUserDto;

    try {
      // 招待コードを検証
      await this.invitationService.verifyInvitation(invitationCode);

      // 既存のユーザーをメールアドレスで確認
      const existingUserByEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUserByEmail) {
        throw new BadRequestException(
          'このメールアドレスは既に登録されています',
        );
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name || email,
            },
          },
        });

      if (error) {
        throw new BadRequestException(error.message);
      }

      if (data.user) {
        const existingUser = await this.prisma.user.findUnique({
          where: { supabaseId: data.user.id },
        });

        if (!existingUser) {
          await this.prisma.user.create({
            data: {
              supabaseId: data.user.id,
              email: data.user.email!,
              name:
                name || data.user.user_metadata?.full_name || data.user.email!,
              role: 'FREE',
            },
          });

          // 招待コードの使用回数を増やす
          await this.invitationService.useInvitation(invitationCode);
        }
      }

      return {
        message:
          'Registration successful. Please check your email for verification.',
        user: data.user,
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Registration failed');
    }
  }

  @Post('resend-confirmation')
  async resendConfirmation(@Body() body: { email: string }) {
    const { email } = body;

    try {
      const { error } = await this.supabaseService.getClient().auth.resend({
        type: 'signup',
        email,
      });

      if (error) {
        throw new BadRequestException(error.message);
      }

      return {
        message:
          'Confirmation email sent successfully. Please check your inbox.',
      };
    } catch (error: any) {
      throw new BadRequestException(
        error.message || 'Failed to resend confirmation email',
      );
    }
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { email: string }) {
    const { email } = body;

    try {
      const { error } = await this.supabaseService
        .getClient()
        .auth.resetPasswordForEmail(email, {
          redirectTo: `http://localhost/auth/reset-password`,
        });

      if (error) {
        throw new BadRequestException(error.message);
      }

      return {
        message:
          'Password reset email sent successfully. Please check your inbox.',
      };
    } catch (error: any) {
      throw new BadRequestException(
        error.message || 'Failed to send password reset email',
      );
    }
  }
}
