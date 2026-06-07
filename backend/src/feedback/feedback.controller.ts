import { Controller, Post, Body, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('feedback')
export class FeedbackController {
	constructor(private readonly feedbackService: FeedbackService) {}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@Throttle({ default: { limit: 3, ttl: 60000 } })
	async submit(
		@Body() dto: CreateFeedbackDto,
		@Request() req: AuthenticatedRequest,
	): Promise<void> {
		const user = req.user as AuthenticatedRequest['user'] & { name?: string };
		await this.feedbackService.submit(dto, {
			name: user.name ?? '',
			email: user.email,
		});
	}
}
