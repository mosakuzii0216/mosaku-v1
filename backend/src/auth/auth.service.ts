import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { BaseOAuthUser, OAuthProvider } from './types/oauth.types';
import { ConfigService } from '../config/config.service';

export interface JwtPayload {
  sub: string; // user.id
  email: string;
  role: 'FREE' | 'PREMIUM' | 'ADMIN';
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async generateTokens(
    userId: string,
    email: string,
    role: 'FREE' | 'PREMIUM' | 'ADMIN',
  ): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    return {
      accessToken,
    };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // パスワードを除外して返す
    return this.excludePassword(user);
  }

  async validateJwtPayload(payload: JwtPayload): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // パスワードを除外して返す
    return this.excludePassword(user);
  }

  async register(
    email: string,
    password: string,
    name?: string,
    invitationCode?: string,
  ): Promise<any> {
    // 既存ユーザーチェック
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    // パスワードハッシュ化
    const hashedPassword = await this.hashPassword(password);

    // 管理者メールチェック
    const isAdmin = this.configService.isAdminEmail(email);

    // ユーザー作成
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email,
        role: isAdmin ? 'ADMIN' : 'FREE',
      },
    });

    // パスワードを除外して返す
    return this.excludePassword(user);
  }

  async login(
    email: string,
    password: string,
  ): Promise<AuthTokens & { user: any }> {
    const user = await this.validateUser(email, password);
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      user,
    };
  }

  async findUserById(id: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // パスワードを除外して返す
    return this.excludePassword(user);
  }

  /**
   * パスワードフィールドを除外するユーティリティメソッド
   */
  private excludePassword<T extends { password?: string | null }>(user: T): Omit<T, 'password'> {
    const { password: _, ...result } = user;
    return result;
  }

  /**
   * 管理者権限チェック
   */
  private isAdminEmail(email?: string): boolean {
    return this.configService.isAdminEmail(email);
  }

  /**
   * 共通 OAuth ログイン処理
   */
  private async handleOAuthLogin(
    oauthUser: BaseOAuthUser,
    providerId: string
  ): Promise<AuthTokens & { user: any }> {
    // OAuth IDまたはメールアドレスでユーザーを検索
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(oauthUser.email ? [{ email: oauthUser.email }] : []),
          { oauthId: providerId },
        ],
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
      // 新規ユーザーの場合は招待コードなしでは登録できない
      throw new BadRequestException(
        'New user registration requires invitation code. Please use the registration with invitation code.',
      );
    }

    // JWTトークンを生成
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      user: this.excludePassword(user),
    };
  }

  /**
   * 共通 OAuth 招待コード付き登録処理
   */
  private async handleOAuthRegistrationWithInvitation(
    oauthUser: BaseOAuthUser,
    providerId: string,
    invitationCode: string,
    fallbackEmail?: string
  ): Promise<AuthTokens & { user: any }> {
    // 招待コードの検証
    const invitation = await this.prisma.invitationCode.findUnique({
      where: { code: invitationCode },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid invitation code');
    }

    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      throw new BadRequestException('Invitation code has expired');
    }

    if (invitation.usedCount >= invitation.maxUses) {
      throw new BadRequestException('Invitation code has been fully used');
    }

    // 既存ユーザーチェック
    const userEmail = oauthUser.email || fallbackEmail;
    if (!userEmail) {
      throw new BadRequestException('Email address is required for registration');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: userEmail },
          { oauthId: providerId },
        ],
      },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists with this email or OAuth account');
    }

    // 管理者権限チェック
    const isAdmin = this.isAdminEmail(userEmail);

    // 新規ユーザー作成
    const user = await this.prisma.user.create({
      data: {
        oauthId: providerId,
        email: userEmail,
        name: oauthUser.name,
        role: isAdmin ? 'ADMIN' : 'FREE',
        emailVerified: !!oauthUser.email, // 実際のメールがある場合のみverified
      },
    });

    // 招待コード使用回数を更新
    await this.prisma.invitationCode.update({
      where: { id: invitation.id },
      data: { usedCount: invitation.usedCount + 1 },
    });

    // JWTトークンを生成
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      user: this.excludePassword(user),
    };
  }

  async googleLogin(googleUser: any): Promise<AuthTokens & { user: any }> {
    const normalizedUser: BaseOAuthUser = {
      id: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      provider: 'google',
    };

    return this.handleOAuthLogin(normalizedUser, googleUser.googleId);
  }

  async googleRegisterWithInvitation(
    googleUser: any,
    invitationCode: string,
  ): Promise<AuthTokens & { user: any }> {
    const normalizedUser: BaseOAuthUser = {
      id: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      provider: 'google',
    };

    return this.handleOAuthRegistrationWithInvitation(
      normalizedUser,
      googleUser.googleId,
      invitationCode
    );
  }

  async githubLogin(githubUser: any): Promise<AuthTokens & { user: any }> {
    const normalizedUser: BaseOAuthUser = {
      id: githubUser.githubId,
      email: githubUser.email,
      name: githubUser.name,
      provider: 'github',
    };

    return this.handleOAuthLogin(normalizedUser, githubUser.githubId);
  }

  async githubRegisterWithInvitation(
    githubUser: any,
    invitationCode: string,
  ): Promise<AuthTokens & { user: any }> {
    const normalizedUser: BaseOAuthUser = {
      id: githubUser.githubId,
      email: githubUser.email,
      name: githubUser.name,
      provider: 'github',
    };

    return this.handleOAuthRegistrationWithInvitation(
      normalizedUser,
      githubUser.githubId,
      invitationCode
    );
  }

  async xLogin(xUser: any): Promise<AuthTokens & { user: any }> {
    const normalizedUser: BaseOAuthUser = {
      id: xUser.xId,
      email: xUser.email,
      name: xUser.name,
      provider: 'x',
    };

    return this.handleOAuthLogin(normalizedUser, xUser.xId);
  }

  async xRegisterWithInvitation(
    xUser: any,
    invitationCode: string,
  ): Promise<AuthTokens & { user: any }> {
    // X OAuth の場合、emailが提供されないことがあるため、フォールバックメールを生成
    const fallbackEmail = `${xUser.username}@x.placeholder.local`;
    
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
      fallbackEmail
    );
  }
}
