import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { SupabaseGuard } from './supabase.guard';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [SupabaseService, SupabaseGuard],
  exports: [SupabaseService, SupabaseGuard],
})
export class AuthModule {}
