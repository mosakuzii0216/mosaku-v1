import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { MemoModule } from './memo/memo.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { InvitationModule } from './invitation/invitation.module';
import { TagModule } from './tag/tag.module';
import { ThemeModule } from './theme/theme.module';
import { ConfigModule } from './config/config.module';
import { NotebookModule } from './notebook/notebook.module';
import { FeedbackModule } from './feedback/feedback.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { McpModule } from './mcp/mcp.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLE_CONFIG } from './config/auth-constants';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SentryUserContextInterceptor } from './common/sentry/sentry-user-context.interceptor';

@Module({
	controllers: [AppController],
	imports: [
		SentryModule.forRoot(),
		// レート制限設定（グローバル）。値は env で上書き可能（THROTTLE_CONFIG.GLOBAL）
		ThrottlerModule.forRoot([
			{
				name: 'default',
				ttl: THROTTLE_CONFIG.GLOBAL.TTL,
				limit: THROTTLE_CONFIG.GLOBAL.LIMIT,
			},
		]),
		ScheduleModule.forRoot(),
		ConfigModule,
		MemoModule,
		AuthModule,
		PrismaModule,
		InvitationModule,
		TagModule,
		ThemeModule,
		NotebookModule,
		FeedbackModule,
		DashboardModule,
		McpModule,
	],
	providers: [
		{ provide: APP_FILTER, useClass: SentryGlobalFilter },
		// グローバルにThrottlerGuardを適用
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
		// JwtAuthGuard をグローバル化。公開エンドポイントは @Public() で opt-out する。
		{
			provide: APP_GUARD,
			useClass: JwtAuthGuard,
		},
		// 認証済みリクエストの間だけ Sentry scope に { id } を載せる side-car
		{
			provide: APP_INTERCEPTOR,
			useClass: SentryUserContextInterceptor,
		},
	],
})
export class AppModule {}
