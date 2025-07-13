import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MemoModule } from './memo/memo.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { InvitationModule } from './invitation/invitation.module';
import { TagModule } from './tag/tag.module';

@Module({
  imports: [MemoModule, AuthModule, PrismaModule, InvitationModule, TagModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
