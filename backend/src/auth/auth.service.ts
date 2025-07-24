import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

export interface JwtPayload {
  sub: string;  // user.id
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

  async generateTokens(userId: string, email: string, role: 'FREE' | 'PREMIUM' | 'ADMIN'): Promise<AuthTokens> {
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

  async register(email: string, password: string, name?: string, invitationCode?: string): Promise<any> {
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

  async login(email: string, password: string): Promise<AuthTokens & { user: any }> {
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
}