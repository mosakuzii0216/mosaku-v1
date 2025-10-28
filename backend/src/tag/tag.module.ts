import { Module } from '@nestjs/common';
import { TagService } from './tag.service';
import { TagController } from './tag.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
	imports: [PrismaModule, AuthModule, CommonModule],
	controllers: [TagController],
	providers: [TagService],
	exports: [TagService],
})
export class TagModule {}
