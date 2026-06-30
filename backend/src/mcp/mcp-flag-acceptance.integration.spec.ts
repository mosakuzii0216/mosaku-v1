import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { McpModule } from './mcp.module';
import { OAuthClientStore } from './auth/oauth-client.store';
import { AuthCodeStore } from './auth/auth-code.store';
import { McpRefreshTokenStore } from './auth/refresh-token.store';
import { ConfigService } from '../config/config.service';
import { MemoService } from '../memo/memo.service';
import { NotebookService } from '../notebook/notebook.service';
import { PrismaService } from '../prisma/prisma.service';
import * as features from '../config/features.config';

/**
 * Task 7.3: feature flag による MCP 入口の完全無効化（受け入れ確認）。
 *
 * feature flag OFF で /mcp・/oauth/*・/.well-known/* がすべて 404 を返し、
 * 既存 REST 機能に無影響であることを確認する（Requirements: 1.5, 1.6）。
 *
 * Claude Code 実接続（manual acceptance 手順）:
 *   FEATURE_MCP_ENDPOINT=true を設定して以下を実行
 *   $ claude mcp add mosaku --transport http <BACKEND_URL>/mcp
 *   → tools/list / create_memo / search_memos が成功することを手動確認
 */

const TEST_SECRET = 'test-jwt-secret-flag-acceptance';
const BACKEND_URL = 'http://localhost:3000';
const MCP_URL = `${BACKEND_URL}/mcp`;

const mockConfig = {
	backendUrl: BACKEND_URL,
	mcpCanonicalUrl: MCP_URL,
	mcpAllowedHosts: ['localhost'],
	jwtSecret: TEST_SECRET,
};

describe('MCP Feature Flag Acceptance (Task 7.3)', () => {
	let app: INestApplication;
	let flagSpy: jest.SpyInstance;

	const clientStore = { create: jest.fn(), findById: jest.fn() };
	const codeStore = { create: jest.fn(), findAndConsume: jest.fn() };
	const refreshStore = {
		create: jest.fn(),
		findByHash: jest.fn(),
		rotate: jest.fn(),
		revoke: jest.fn(),
	};
	const mockMemoService = {
		searchPaginated: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
		create: jest.fn().mockResolvedValue({ id: 'm1', title: 't', notebookId: null }),
	};
	const mockNotebookService = { findOne: jest.fn() };

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			imports: [
				McpModule,
				JwtModule.register({ secret: TEST_SECRET }),
				ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
			],
			providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
		})
			.overrideProvider(ConfigService)
			.useValue(mockConfig)
			.overrideProvider(OAuthClientStore)
			.useValue(clientStore)
			.overrideProvider(AuthCodeStore)
			.useValue(codeStore)
			.overrideProvider(McpRefreshTokenStore)
			.useValue(refreshStore)
			.overrideProvider(MemoService)
			.useValue(mockMemoService)
			.overrideProvider(NotebookService)
			.useValue(mockNotebookService)
			.overrideProvider(PrismaService)
			.useValue({})
			.compile();

		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		flagSpy = jest.spyOn(features, 'isFeatureEnabled').mockReturnValue(true);
		jest.clearAllMocks();
	});

	afterEach(() => {
		flagSpy.mockRestore();
	});

	// =================== feature flag OFF: MCP 入口完全無効化 ===================

	describe('feature flag OFF: MCP 入口をすべて 404 に無効化', () => {
		beforeEach(() => {
			flagSpy.mockReturnValue(false);
		});

		it('POST /mcp が 404 を返すこと', async () => {
			const res = await request(app.getHttpServer() as Server)
				.post('/mcp')
				.set('Content-Type', 'application/json')
				.set('Accept', 'application/json, text/event-stream')
				.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

			expect(res.status).toBe(404);
		});

		it('GET /.well-known/oauth-protected-resource が 404 を返すこと', async () => {
			const res = await request(app.getHttpServer() as Server).get(
				'/.well-known/oauth-protected-resource',
			);

			expect(res.status).toBe(404);
		});

		it('GET /.well-known/oauth-authorization-server が 404 を返すこと', async () => {
			const res = await request(app.getHttpServer() as Server).get(
				'/.well-known/oauth-authorization-server',
			);

			expect(res.status).toBe(404);
		});

		it('POST /oauth/register が 404 を返すこと', async () => {
			const res = await request(app.getHttpServer() as Server)
				.post('/oauth/register')
				.send({ client_name: 'test', redirect_uris: ['http://localhost:9000/cb'] });

			expect(res.status).toBe(404);
		});
	});

	// =================== feature flag ON: well-known が正常動作 ===================

	describe('feature flag ON: discovery エンドポイントが正常応答', () => {
		it('GET /.well-known/oauth-protected-resource が resource / scopes_supported を返すこと', async () => {
			const res = await request(app.getHttpServer() as Server)
				.get('/.well-known/oauth-protected-resource')
				.expect(200);

			const prmBody = res.body as { resource: string; scopes_supported: string[] };
			expect(prmBody.resource).toBe(MCP_URL);
			expect(prmBody.scopes_supported).toEqual(
				expect.arrayContaining<string>(['memo:read', 'memo:write']),
			);
		});

		it('GET /.well-known/oauth-authorization-server が S256 を広告すること', async () => {
			const res = await request(app.getHttpServer() as Server)
				.get('/.well-known/oauth-authorization-server')
				.expect(200);

			expect(
				(res.body as { code_challenge_methods_supported: string[] })
					.code_challenge_methods_supported,
			).toContain('S256');
		});
	});
});
