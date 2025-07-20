import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ThemeController } from './theme.controller';
import { ThemeService } from './theme.service';

@Module({
  controllers: [ThemeController],
  providers: [
    ThemeService,
    {
      provide: PrismaClient,
      useValue: new PrismaClient(),
    },
  ],
  exports: [ThemeService],
})
export class ThemeModule {}
