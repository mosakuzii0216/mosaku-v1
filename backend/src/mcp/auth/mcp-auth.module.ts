import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '../../config/config.service';
import { OAuthClientStore } from './oauth-client.store';
import { AuthCodeStore } from './auth-code.store';
import { McpRefreshTokenStore } from './refresh-token.store';
import { McpTokenVerifier } from './mcp-token.verifier';
import { McpBearerGuard } from './mcp-bearer.guard';
import { MetadataController } from './metadata.controller';
import { OAuthController } from './oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { McpFeatureFlagGuard } from '../mcp-feature-flag.guard';

/**
 * OAuth 認可サーバー層のストアと MCP 専用 Bearer 検証を束ねるモジュール。
 *
 * JwtModule を McpAuthModule 内で独立登録（AuthModule への依存循環を避ける）。
 * 署名鍵は AuthModule と同一 JWT_SECRET を共有し、token_use + aud でトークンを相互排他する。
 */
@Module({
	imports: [
		PrismaModule,
		ConfigModule,
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.jwtSecret,
			}),
		}),
	],
	controllers: [MetadataController, OAuthController],
	providers: [
		OAuthClientStore,
		AuthCodeStore,
		McpRefreshTokenStore,
		McpTokenVerifier,
		McpBearerGuard,
		McpOAuthService,
		McpFeatureFlagGuard,
	],
	exports: [
		OAuthClientStore,
		AuthCodeStore,
		McpRefreshTokenStore,
		McpTokenVerifier,
		McpBearerGuard,
	],
})
export class McpAuthModule {}
