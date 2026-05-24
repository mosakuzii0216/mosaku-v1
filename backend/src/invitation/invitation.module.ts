import { Module } from '@nestjs/common';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { CODE_GENERATOR, NanoidCodeGenerator } from './utils/code-generator';

@Module({
	imports: [PrismaModule, AuthModule, CommonModule],
	controllers: [InvitationController],
	providers: [InvitationService, { provide: CODE_GENERATOR, useClass: NanoidCodeGenerator }],
	exports: [InvitationService, CODE_GENERATOR],
})
export class InvitationModule {}
