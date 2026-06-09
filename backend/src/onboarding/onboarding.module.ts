import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { NotebookModule } from '../notebook/notebook.module';
import { MemoModule } from '../memo/memo.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [PrismaModule, NotebookModule, MemoModule],
	controllers: [OnboardingController],
	providers: [OnboardingService],
})
export class OnboardingModule {}
