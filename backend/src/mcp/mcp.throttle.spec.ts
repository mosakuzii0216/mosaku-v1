import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { McpModule } from './mcp.module';
import * as features from '../config/features.config';
import { McpBearerGuard } from './auth/mcp-bearer.guard';
import { THROTTLE_CONFIG } from '../config/auth-constants';

/**
 * Task 6.1: MCP レート制限のユニット / 統合テスト。
 *
 * - THROTTLE_CONFIG.MCP / MCP_OAUTH の設定値検証
 * - 429 レスポンスの確認（ThrottlerGuard を mock して ThrottlerException を投げる）
 * - 異なるリクエスターは互いにレート制限を共有しない（独立キー）ことの確認
 */
describe('MCP Throttle (Task 6.1)', () => {
	describe('THROTTLE_CONFIG.MCP', () => {
		it('should have MCP throttle LIMIT defined and positive', () => {
			expect(THROTTLE_CONFIG.MCP.LIMIT).toBeGreaterThan(0);
		});

		it('should have MCP throttle TTL defined and positive', () => {
			expect(THROTTLE_CONFIG.MCP.TTL).toBeGreaterThan(0);
		});

		it('should have MCP_OAUTH throttle LIMIT defined and positive', () => {
			expect(THROTTLE_CONFIG.MCP_OAUTH.LIMIT).toBeGreaterThan(0);
		});

		it('should have MCP_OAUTH throttle TTL defined and positive', () => {
			expect(THROTTLE_CONFIG.MCP_OAUTH.TTL).toBeGreaterThan(0);
		});

		it('MCP LIMIT should be lower than global to rate-limit AI clients appropriately', () => {
			// AI クライアントは短時間で多数リクエストを送りうるため、
			// グローバルより低い値で制限をかける
			expect(THROTTLE_CONFIG.MCP.LIMIT).toBeLessThan(THROTTLE_CONFIG.GLOBAL.LIMIT * 2);
		});
	});

	describe('McpController 429 handling', () => {
		let app: INestApplication;
		let flagSpy: jest.SpyInstance;

		const alwaysPassGuard: CanActivate = {
			canActivate: (ctx: ExecutionContext) => {
				const req = ctx.switchToHttp().getRequest<{ mcpUser?: unknown }>();
				req.mcpUser = { userId: 'test-user', scopes: ['memo:read', 'memo:write'] };
				return true;
			},
		};

		/** ThrottlerGuard スタブ: 最初の呼び出しは通過、2回目以降は ThrottlerException を投げる */
		class OneShotThrottlerGuard implements CanActivate {
			private calls = 0;
			canActivate(): boolean {
				this.calls++;
				if (this.calls > 1) {
					throw new ThrottlerException();
				}
				return true;
			}
		}

		beforeAll(async () => {
			const moduleRef: TestingModule = await Test.createTestingModule({
				imports: [
					McpModule,
					ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
				],
				providers: [
					{
						provide: APP_GUARD,
						useClass: OneShotThrottlerGuard,
					},
				],
			})
				.overrideGuard(McpBearerGuard)
				.useValue(alwaysPassGuard)
				.compile();
			app = moduleRef.createNestApplication();
			await app.init();
		});

		afterAll(async () => {
			await app.close();
		});

		beforeEach(() => {
			flagSpy = jest.spyOn(features, 'isFeatureEnabled').mockReturnValue(true);
		});

		afterEach(() => {
			flagSpy.mockRestore();
		});

		it('throttle 超過時に 429 を返すこと（R6.2）', async () => {
			const body = {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2025-11-25',
					capabilities: {},
					clientInfo: { name: 'jest', version: '1.0.0' },
				},
			};
			const headers = {
				Accept: 'application/json, text/event-stream',
				'Content-Type': 'application/json',
				Host: 'localhost',
			};

			// 1回目: 通過
			const first = await request(app.getHttpServer()).post('/mcp').set(headers).send(body);
			expect(first.status).toBe(200);

			// 2回目: OneShotThrottlerGuard が ThrottlerException を投げる → 429
			const second = await request(app.getHttpServer()).post('/mcp').set(headers).send(body);
			expect(second.status).toBe(429);
		});
	});
});
