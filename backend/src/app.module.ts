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
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';

@Module({
	controllers: [AppController],
	imports: [
		SentryModule.forRoot(),
		// レート制限設定（グローバル）
		ThrottlerModule.forRoot([
			{
				name: 'default',
				ttl: 60000, // 60秒
				limit: 30, // 60秒間に30リクエストまで
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
	],
	providers: [
		{ provide: APP_FILTER, useClass: SentryGlobalFilter },
		// グローバルにThrottlerGuardを適用
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
})
export class AppModule {}
