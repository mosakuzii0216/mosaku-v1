import { Module } from '@nestjs/common';
import { MemoService } from './memo.service';
import { MemoSharingService } from './memo-sharing.service';
import { MemoController } from './memo.controller';
import { PublicMemoController } from './public-memo.controller';
import { MemoEditObservabilityInterceptor } from './memo-edit-observability.interceptor';
import { PublicReadObservabilityInterceptor } from './public-read-observability.interceptor';
import { TrashCleanupService } from './trash-cleanup.service';
import { DbPoolObservabilityService } from './db-pool-observability.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
	imports: [PrismaModule, AuthModule, CommonModule],
	controllers: [MemoController, PublicMemoController],
	providers: [
		MemoService,
		MemoSharingService,
		TrashCleanupService,
		DbPoolObservabilityService,
		PublicReadObservabilityInterceptor,
		MemoEditObservabilityInterceptor,
	],
	exports: [MemoSharingService],
})
export class MemoModule {}
