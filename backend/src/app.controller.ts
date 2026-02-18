import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
	@Public()
	@SkipThrottle()
	@Get('health')
	health() {
		return { status: 'ok' };
	}
}
