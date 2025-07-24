import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SupabaseService } from './supabase.service';
import { SupabaseGuard } from './supabase.guard';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InvitationService } from '../invitation/invitation.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    SupabaseService,
    SupabaseGuard,
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    InvitationService,
  ],
  exports: [SupabaseService, SupabaseGuard, AuthService, JwtAuthGuard],
})
export class AuthModule {}
