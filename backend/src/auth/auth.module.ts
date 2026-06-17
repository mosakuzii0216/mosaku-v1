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
import { XRegisterStartGuard } from './x-register-start.guard';
import { InvitationStateInvalidFilter } from './x-register-start.filter';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { RefreshCsrfGuard } from './refresh-csrf.guard';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';
import { InvitationStateService } from './invitation-state.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { ConfigService } from '../config/config.service';
import { InvitationService } from '../invitation/invitation.service';
import { CODE_GENERATOR, NanoidCodeGenerator } from '../invitation/utils/code-generator';
import { QUOTA_POLICY, PrismaQuotaPolicy } from '../invitation/utils/quota-policy';
import { JWT_EXPIRATION } from '../config/auth-constants';
import { PasswordResetService, MAIL_SERVICE } from './password-reset.service';
import { MailModule } from '../mail/mail.module';
import { MailService } from '../mail/mail.service';

@Module({
	imports: [
		PrismaModule,
		PassportModule,
		CommonModule,
		MailModule,
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
		XRegisterStartGuard,
		InvitationStateInvalidFilter,
		RefreshCookieHelper,
		RefreshCsrfGuard,
		RefreshTokenRepository,
		RefreshTokenService,
		InvitationService,
		InvitationStateService,
		{ provide: CODE_GENERATOR, useClass: NanoidCodeGenerator },
		{ provide: QUOTA_POLICY, useClass: PrismaQuotaPolicy },
		PasswordResetService,
		{ provide: MAIL_SERVICE, useExisting: MailService },
	],
	exports: [
		AuthService,
		JwtTokenService,
		OAuthService,
		InvitationStateService,
		JwtAuthGuard,
		GoogleAuthGuard,
		GitHubAuthGuard,
		LineAuthGuard,
		AppleAuthGuard,
		XAuthGuard,
		RefreshCookieHelper,
		RefreshCsrfGuard,
		RefreshTokenRepository,
		RefreshTokenService,
	],
})
export class AuthModule {}
