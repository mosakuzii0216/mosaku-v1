import { Module } from '@nestjs/common';
import { MemoService } from './memo.service';
import { MemoSharingService } from './memo-sharing.service';
import { MemoController } from './memo.controller';
import { PublicMemoController } from './public-memo.controller';
import { TrashCleanupService } from './trash-cleanup.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
	imports: [PrismaModule, AuthModule, CommonModule],
	controllers: [MemoController, PublicMemoController],
	providers: [MemoService, MemoSharingService, TrashCleanupService],
	exports: [MemoSharingService],
})
export class MemoModule {}
