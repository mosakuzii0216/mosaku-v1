import { Controller, Post, Body, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { OnboardingService, type OnboardingResult } from './onboarding.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('onboarding')
export class OnboardingController {
	constructor(private readonly onboardingService: OnboardingService) {}

	@Post('complete')
	@HttpCode(HttpStatus.OK)
	async complete(
		@Body() dto: CompleteOnboardingDto,
		@Request() req: AuthenticatedRequest,
	): Promise<OnboardingResult> {
		return this.onboardingService.complete(req.user.id, dto.themeId);
	}

	@Post('skip')
	@HttpCode(HttpStatus.OK)
	async skip(@Request() req: AuthenticatedRequest): Promise<{ message: string }> {
		await this.onboardingService.skip(req.user.id);
		return { message: 'skipped' };
	}
}
