import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

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
    const { password: _, ...result } = user;
    return result;
  }

  async validateJwtPayload(payload: JwtPayload): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // パスワードを除外して返す
    const { password: _, ...result } = user;
    return result;
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
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdmin = adminEmail && email === adminEmail;

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
    const { password: _, ...result } = user;
    return result;
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
    const { password: _, ...result } = user;
    return result;
  }

  async googleLogin(googleUser: any): Promise<AuthTokens & { user: any }> {
    // Google IDまたはメールアドレスでユーザーを検索
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: googleUser.email },
          { supabaseId: googleUser.googleId }, // 既存のsupabaseIdフィールドをgoogleIdとして利用
        ],
      },
    });

    if (user) {
      // 既存ユーザーの場合、Google IDと名前を更新
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          supabaseId: googleUser.googleId, // Google IDを保存
          name: googleUser.name,
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

    // パスワードを除外して返す
    const { password: _, ...userResult } = user;

    return {
      ...tokens,
      user: userResult,
    };
  }

  async googleRegisterWithInvitation(
    googleUser: any,
    invitationCode: string,
  ): Promise<AuthTokens & { user: any }> {
    // 既存ユーザーチェック
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: googleUser.email }, { supabaseId: googleUser.googleId }],
      },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    // 招待コードの検証
    const invitation = await this.prisma.invitationCode.findUnique({
      where: { code: invitationCode },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid invitation code');
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation code has expired');
    }

    if (invitation.maxUses && invitation.usedCount >= invitation.maxUses) {
      throw new BadRequestException('Invitation code has reached maximum uses');
    }

    // 管理者メールチェック
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdmin = adminEmail && googleUser.email === adminEmail;

    // 新規ユーザー作成
    const user = await this.prisma.user.create({
      data: {
        supabaseId: googleUser.googleId,
        email: googleUser.email,
        name: googleUser.name,
        role: isAdmin ? 'ADMIN' : 'FREE',
        emailVerified: true,
      },
    });

    // 招待コードの使用回数を更新
    await this.prisma.invitationCode.update({
      where: { code: invitationCode },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });

    // JWTトークンを生成
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // パスワードを除外して返す
    const { password: _, ...userResult } = user;

    return {
      ...tokens,
      user: userResult,
    };
  }

  async githubLogin(githubUser: any): Promise<AuthTokens & { user: any }> {
    // GitHub IDまたはメールアドレスでユーザーを検索
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: githubUser.email },
          { supabaseId: githubUser.githubId }, // 既存のsupabaseIdフィールドをgithubIdとして利用
        ],
      },
    });

    if (user) {
      // 既存ユーザーの場合、GitHub IDと名前を更新
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          supabaseId: githubUser.githubId, // GitHub IDを保存
          name: githubUser.name,
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

    // パスワードを除外して返す
    const { password: _, ...userResult } = user;

    return {
      ...tokens,
      user: userResult,
    };
  }

  async githubRegisterWithInvitation(
    githubUser: any,
    invitationCode: string,
  ): Promise<AuthTokens & { user: any }> {
    // 既存ユーザーチェック
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: githubUser.email }, { supabaseId: githubUser.githubId }],
      },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    // 招待コードの検証
    const invitation = await this.prisma.invitationCode.findUnique({
      where: { code: invitationCode },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid invitation code');
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation code has expired');
    }

    if (invitation.maxUses && invitation.usedCount >= invitation.maxUses) {
      throw new BadRequestException('Invitation code has reached maximum uses');
    }

    // 管理者メールチェック
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdmin = adminEmail && githubUser.email === adminEmail;

    // 新規ユーザー作成
    const user = await this.prisma.user.create({
      data: {
        supabaseId: githubUser.githubId,
        email: githubUser.email,
        name: githubUser.name,
        role: isAdmin ? 'ADMIN' : 'FREE',
        emailVerified: true,
      },
    });

    // 招待コードの使用回数を更新
    await this.prisma.invitationCode.update({
      where: { code: invitationCode },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });

    // JWTトークンを生成
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // パスワードを除外して返す
    const { password: _, ...userResult } = user;

    return {
      ...tokens,
      user: userResult,
    };
  }

  async xLogin(xUser: any): Promise<AuthTokens & { user: any }> {
    // X OAuth の場合、emailが提供されないことがあるため、フォールバックメールを生成
    const userEmail = xUser.email || `${xUser.username}@x.placeholder.local`;
    
    // X IDまたはメールアドレスでユーザーを検索
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(xUser.email ? [{ email: xUser.email }] : []), // 実際のemailがある場合のみ検索条件に追加
          { email: userEmail }, // フォールバックメールでも検索
          { supabaseId: xUser.xId }, // 既存のsupabaseIdフィールドをxIdとして利用
        ],
      },
    });

    if (user) {
      // 既存ユーザーの場合、X IDと名前を更新
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          supabaseId: xUser.xId, // X IDを保存
          name: xUser.name,
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

    // パスワードを除外して返す
    const { password: _, ...userResult } = user;

    return {
      ...tokens,
      user: userResult,
    };
  }

  async xRegisterWithInvitation(
    xUser: any,
    invitationCode: string,
  ): Promise<AuthTokens & { user: any }> {
    // 既存ユーザーチェック
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: xUser.email }, { supabaseId: xUser.xId }],
      },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    // 招待コードの検証
    const invitation = await this.prisma.invitationCode.findUnique({
      where: { code: invitationCode },
    });

    if (!invitation) {
      throw new BadRequestException('Invalid invitation code');
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation code has expired');
    }

    if (invitation.maxUses && invitation.usedCount >= invitation.maxUses) {
      throw new BadRequestException('Invitation code has reached maximum uses');
    }

    // X OAuth の場合、emailが提供されないことがあるため、フォールバックメールを生成
    const userEmail = xUser.email || `${xUser.username}@x.placeholder.local`;
    
    // 管理者メールチェック
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdmin = adminEmail && xUser.email === adminEmail;

    // 新規ユーザー作成
    const user = await this.prisma.user.create({
      data: {
        supabaseId: xUser.xId,
        email: userEmail,
        name: xUser.name,
        role: isAdmin ? 'ADMIN' : 'FREE',
        emailVerified: xUser.email ? true : false, // 実際のメールがある場合のみverified
      },
    });

    // 招待コードの使用回数を更新
    await this.prisma.invitationCode.update({
      where: { code: invitationCode },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });

    // JWTトークンを生成
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // パスワードを除外して返す
    const { password: _, ...userResult } = user;

    return {
      ...tokens,
      user: userResult,
    };
  }
}
