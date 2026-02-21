import { Module } from '@nestjs/common';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
	imports: [PrismaModule, AuthModule, CommonModule],
	controllers: [InvitationController],
	providers: [InvitationService],
	exports: [InvitationService],
})
export class InvitationModule {}
