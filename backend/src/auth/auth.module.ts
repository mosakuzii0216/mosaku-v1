import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { SupabaseGuard } from './supabase.guard';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InvitationService } from '../invitation/invitation.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [SupabaseService, SupabaseGuard, InvitationService],
  exports: [SupabaseService, SupabaseGuard],
})
export class AuthModule {}
