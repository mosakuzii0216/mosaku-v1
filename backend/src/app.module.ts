import { Module } from '@nestjs/common';
import { MemoModule } from './memo/memo.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { InvitationModule } from './invitation/invitation.module';
import { TagModule } from './tag/tag.module';
import { ThemeModule } from './theme/theme.module';

@Module({
  imports: [
    MemoModule,
    AuthModule,
    PrismaModule,
    InvitationModule,
    TagModule,
    ThemeModule,
  ],
})
export class AppModule {}
