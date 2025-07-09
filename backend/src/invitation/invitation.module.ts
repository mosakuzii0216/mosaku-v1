import { Module } from '@nestjs/common';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseService } from '../auth/supabase.service';
import { SupabaseGuard } from '../auth/supabase.guard';

@Module({
  imports: [PrismaModule],
  controllers: [InvitationController],
  providers: [InvitationService, SupabaseService, SupabaseGuard],
  exports: [InvitationService],
})
export class InvitationModule {}
