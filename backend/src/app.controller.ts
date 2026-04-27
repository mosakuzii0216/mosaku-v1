import { Controller, Get, NotFoundException } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from './config/config.service';
import { SentrySmokeTestError } from './common/sentry/sentry-smoke-test.error';

@Controller()
export class AppController {
	constructor(private readonly configService: ConfigService) {}

	@Public()
	@SkipThrottle()
	@Get('health')
	health() {
		return { status: 'ok' };
	}

	// SENTRY_DEBUG_ENABLED=true のときだけ稼働する Production smoke test 用エンドポイント。
	// 普段は 404 を返し、smoke test 完了後は env を消して endpoint を即時無効化する運用。
	@Public()
	@Get('debug-sentry')
	debugSentry(): never {
		if (!this.configService.sentry.debugEnabled) {
			throw new NotFoundException();
		}
		throw new SentrySmokeTestError();
	}
}
