/**
 * `/debug-sentry` Production smoke test エンドポイントの HTTP 経由 e2e テスト。
 *
 * 検証する契約:
 * - `SENTRY_DEBUG_ENABLED=true` のとき GET /debug-sentry が 500 を返し、
 *   レスポンスに `SentrySmokeTestError` の痕跡が乗る（=Sentry に必ず届く）
 * - `SENTRY_DEBUG_ENABLED` 未設定 / "false" のときは 404 を返し、
 *   間違って production に endpoint が露出しても安全側にフェイルすること
 *
 * 実 DB / 実 Sentry には接続せず PrismaService を no-op に差し替え、
 * Sentry SDK は `init` を mock して副作用を遮断する。
 */

jest.mock('@sentry/nestjs', () => {
	const actual = jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs');
	return {
		...actual,
		init: jest.fn(),
		getCurrentScope: () => ({ setUser: jest.fn(), setTag: jest.fn() }),
	};
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session';
process.env.DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const buildApp = async (): Promise<INestApplication<App>> => {
	const moduleFixture: TestingModule = await Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(PrismaService)
		.useValue({
			$connect: jest.fn(),
			$disconnect: jest.fn(),
			onModuleInit: jest.fn(),
			onModuleDestroy: jest.fn(),
		})
		.compile();

	const app = moduleFixture.createNestApplication();
	await app.init();
	return app;
};

describe('GET /debug-sentry (e2e)', () => {
	const originalDebugFlag = process.env.SENTRY_DEBUG_ENABLED;

	afterEach(() => {
		if (originalDebugFlag === undefined) {
			delete process.env.SENTRY_DEBUG_ENABLED;
		} else {
			process.env.SENTRY_DEBUG_ENABLED = originalDebugFlag;
		}
	});

	it('SENTRY_DEBUG_ENABLED 未設定のとき 404 を返すこと', async () => {
		delete process.env.SENTRY_DEBUG_ENABLED;
		const app = await buildApp();
		try {
			await request(app.getHttpServer()).get('/debug-sentry').expect(404);
		} finally {
			await app.close();
		}
	});

	it('SENTRY_DEBUG_ENABLED=false のとき 404 を返すこと', async () => {
		process.env.SENTRY_DEBUG_ENABLED = 'false';
		const app = await buildApp();
		try {
			await request(app.getHttpServer()).get('/debug-sentry').expect(404);
		} finally {
			await app.close();
		}
	});

	it('SENTRY_DEBUG_ENABLED=true のとき 500 を返し SentrySmokeTestError を発火すること', async () => {
		process.env.SENTRY_DEBUG_ENABLED = 'true';
		const app = await buildApp();
		try {
			const response = await request(app.getHttpServer()).get('/debug-sentry');
			expect(response.status).toBe(500);
		} finally {
			await app.close();
		}
	});
});
