import { Module } from '@nestjs/common';
import { AuthorizationService } from './services/authorization.service';
import { AppLogger } from './logger/app-logger.service';
import { AdminGuard } from './guards/admin.guard';

@Module({
	providers: [AuthorizationService, AppLogger, AdminGuard],
	exports: [AuthorizationService, AppLogger, AdminGuard],
})
export class CommonModule {}
