import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { GitHubStrategy } from './github.strategy';
import { XStrategy } from './x.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { GitHubAuthGuard } from './github-auth.guard';
import { XAuthGuard } from './x-auth.guard';
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
		JwtStrategy,
		GoogleStrategy,
		GitHubStrategy,
		XStrategy,
		JwtAuthGuard,
		GoogleAuthGuard,
		GitHubAuthGuard,
		XAuthGuard,
		InvitationService,
	],
	exports: [AuthService, JwtAuthGuard, GoogleAuthGuard, GitHubAuthGuard, XAuthGuard],
})
export class AuthModule {}
