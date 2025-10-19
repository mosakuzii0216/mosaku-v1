import { Module } from '@nestjs/common';
import { MemoModule } from './memo/memo.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { InvitationModule } from './invitation/invitation.module';
import { TagModule } from './tag/tag.module';
import { ThemeModule } from './theme/theme.module';
import { ConfigModule } from './config/config.module';
import { NotebookModule } from './notebook/notebook.module';

@Module({
  imports: [
    ConfigModule,
    MemoModule,
    AuthModule,
    PrismaModule,
    InvitationModule,
    TagModule,
    ThemeModule,
    NotebookModule,
  ],
})
export class AppModule {}
