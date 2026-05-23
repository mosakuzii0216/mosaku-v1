import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { OAuthService } from './oauth.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { GitHubStrategy } from './github.strategy';
import { LineStrategy } from './line.strategy';
import { AppleStrategy } from './apple.strategy';
import { XStrategy } from './x.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
	GoogleAuthGuard,
	GitHubAuthGuard,
	LineAuthGuard,
	AppleAuthGuard,
	XAuthGuard,
} from './oauth-auth.guards';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import { JWT_EXPIRATION } from '../config/auth-constants';

@Module({
	imports: [
		PrismaModule,
		PassportModule,
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				secret: configService.jwtSecret,
				signOptions: { expiresIn: JWT_EXPIRATION },
			}),
		}),
	],
	controllers: [AuthController],
	providers: [
		AuthService,
		JwtTokenService,
		OAuthService,
		JwtStrategy,
		GoogleStrategy,
		GitHubStrategy,
		LineStrategy,
		AppleStrategy,
		XStrategy,
		JwtAuthGuard,
		GoogleAuthGuard,
		GitHubAuthGuard,
		LineAuthGuard,
		AppleAuthGuard,
		XAuthGuard,
		RefreshCookieHelper,
		InvitationService,
	],
	exports: [
		AuthService,
		JwtTokenService,
		OAuthService,
		JwtAuthGuard,
		GoogleAuthGuard,
		GitHubAuthGuard,
		LineAuthGuard,
		AppleAuthGuard,
		XAuthGuard,
		RefreshCookieHelper,
	],
})
export class AuthModule {}
