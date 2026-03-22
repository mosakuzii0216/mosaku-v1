import { Module } from '@nestjs/common';
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
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';

@Module({
	controllers: [AppController],
	imports: [
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
		// グローバルにThrottlerGuardを適用
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
})
export class AppModule {}
