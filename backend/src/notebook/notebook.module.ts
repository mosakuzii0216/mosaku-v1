import { Module } from '@nestjs/common';
import { NotebookService } from './notebook.service';
import { NotebookController } from './notebook.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { CommonModule } from 'src/common/common.module';

@Module({
	imports: [PrismaModule, AuthModule, CommonModule],
	controllers: [NotebookController],
	providers: [NotebookService],
	exports: [NotebookService],
})
export class NotebookModule {}
