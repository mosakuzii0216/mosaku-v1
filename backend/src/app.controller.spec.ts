/**
 * AppController の `/debug-sentry` Production smoke test エンドポイントの単体テスト。
 *
 * 振る舞いの契約:
 * - `SENTRY_DEBUG_ENABLED=true` のときだけ `SentrySmokeTestError` を throw（500）
 * - それ以外は `NotFoundException` を throw して 404 を返し、誤起動時に Sentry が汚染されないようにする
 * - `SentrySmokeTestError` の `name` は `instrument.ts` の `ignoreErrors` に
 *   含まれない名前であり、Sentry 側に確実に届くことを担保する
 */

import { NotFoundException } from '@nestjs/common';

import { AppController } from './app.controller';
import { ConfigService, SentryConfig } from './config/config.service';
import { SentrySmokeTestError } from './common/sentry/sentry-smoke-test.error';

const buildSentryConfig = (debugEnabled: boolean): SentryConfig => ({
	dsn: undefined,
	environment: 'development',
	release: undefined,
	tracesSampleRate: 0,
	profilesSampleRate: 0,
	debugEnabled,
});

const createController = (debugEnabled: boolean): AppController => {
	const configService = { sentry: buildSentryConfig(debugEnabled) } as ConfigService;
	return new AppController(configService);
};

describe('AppController#debugSentry', () => {
	it('debugEnabled=true のとき SentrySmokeTestError を throw すること', () => {
		const controller = createController(true);

		expect(() => controller.debugSentry()).toThrow(SentrySmokeTestError);
	});

	it('SentrySmokeTestError の name が "SentrySmokeTestError" で ignoreErrors と被らないこと', () => {
		const controller = createController(true);

		try {
			controller.debugSentry();
			fail('debugSentry は SentrySmokeTestError を throw するはず');
		} catch (error) {
			expect(error).toBeInstanceOf(SentrySmokeTestError);
			expect((error as Error).name).toBe('SentrySmokeTestError');
		}
	});

	it('debugEnabled=false のとき NotFoundException を throw して 404 を返すこと', () => {
		const controller = createController(false);

		expect(() => controller.debugSentry()).toThrow(NotFoundException);
	});

	it('既存の health エンドポイントは debugEnabled に依存せず正常動作すること', () => {
		const controller = createController(false);

		expect(controller.health()).toEqual({ status: 'ok' });
	});
});
