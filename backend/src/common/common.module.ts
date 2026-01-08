import { Module } from '@nestjs/common';
import { AuthorizationService } from './services/authorization.service';
import { AppLogger } from './logger/app-logger.service';

@Module({
	providers: [AuthorizationService, AppLogger],
	exports: [AuthorizationService, AppLogger],
})
export class CommonModule {}
