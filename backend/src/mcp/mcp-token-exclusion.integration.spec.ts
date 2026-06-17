import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import request from 'supertest';
import { MetadataController } from './auth/metadata.controller';
import { OAuthController } from './auth/oauth.controller';
import { McpOAuthService } from './auth/mcp-oauth.service';
import { McpFeatureFlagGuard } from './mcp-feature-flag.guard';
import { McpTokenVerifier } from './auth/mcp-token.verifier';
import { McpBearerGuard } from './auth/mcp-bearer.guard';
import { OAuthClientStore } from './auth/oauth-client.store';
import { AuthCodeStore } from './auth/auth-code.store';
import { McpRefreshTokenStore } from './auth/refresh-token.store';
import { ConfigService } from '../config/config.service';
import * as features from '../config/features.config';
import { McpModule } from './mcp.module';
import { MemoService } from '../memo/memo.service';
import { NotebookService } from '../notebook/notebook.service';

/**
 * Task 7.2: 既存無影響・トークン相互排他・提供形態の回帰テスト。
 *
 * _Requirements: 1.6, 8.1, 8.2, 8.3_
 */

const TEST_SECRET = 'test-jwt-secret-exclusion';
const BACKEND_URL = 'http://localhost:3000';
const MCP_URL = `${BACKEND_URL}/mcp`;

const mockConfig = {
	backendUrl: BACKEND_URL,
	mcpCanonicalUrl: MCP_URL,
	mcpAllowedHosts: ['localhost'],
	jwtSecret: TEST_SECRET,
};

describe('MCP Token Mutual Exclusion (Task 7.2)', () => {
	let app: INestApplication;
	let jwtService: JwtService;
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
			providers: [
				{ provide: APP_GUARD, useClass: ThrottlerGuard },
				{ provide: OAuthClientStore, useValue: clientStore },
				{ provide: AuthCodeStore, useValue: codeStore },
				{ provide: McpRefreshTokenStore, useValue: refreshStore },
				{ provide: ConfigService, useValue: mockConfig },
				{ provide: MemoService, useValue: mockMemoService },
				{ provide: NotebookService, useValue: mockNotebookService },
			],
		})
			.overrideProvider(ConfigService)
			.useValue(mockConfig)
			.overrideProvider(MemoService)
			.useValue(mockMemoService)
			.overrideProvider(NotebookService)
			.useValue(mockNotebookService)
			.compile();

		app = moduleRef.createNestApplication();
		await app.init();

		jwtService = moduleRef.get<JwtService>(JwtService);
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

	// =================== 相互排他 ===================

	describe('トークン相互排他（passthrough 防止）', () => {
		it('REST ログイントークン（token_use なし）は MCP エンドポイントで 401 を返すこと', async () => {
			// REST 用トークン: token_use, aud, scope を持たない
			const restToken = jwtService.sign({ sub: 'user-1', email: 'u@example.com', role: 'USER' });

			const res = await request(app.getHttpServer())
				.post('/mcp')
				.set('Authorization', `Bearer ${restToken}`)
				.set('Accept', 'application/json, text/event-stream')
				.set('Content-Type', 'application/json')
				.set('Host', 'localhost')
				.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

			expect(res.status).toBe(401);
		});

		it('MCP アクセストークン（token_use=mcp）は /mcp で有効に動作すること', async () => {
			// MCP 用トークン: token_use=mcp, aud, scope を持つ
			const mcpToken = jwtService.sign({
				sub: 'user-1',
				aud: MCP_URL,
				scope: 'memo:read memo:write',
				token_use: 'mcp',
			});

			const res = await request(app.getHttpServer())
				.post('/mcp')
				.set('Authorization', `Bearer ${mcpToken}`)
				.set('Accept', 'application/json, text/event-stream')
				.set('Content-Type', 'application/json')
				.set('Host', 'localhost')
				.send({
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: {
						protocolVersion: '2025-11-25',
						capabilities: {},
						clientInfo: { name: 'jest', version: '1.0.0' },
					},
				});

			expect(res.status).toBe(200);
		});
	});

	// =================== feature flag 動作確認 ===================

	describe('feature flag による入口制御（R1.6）', () => {
		it('feature flag OFF のとき /mcp は 404 を返し既存機能に影響しないこと', async () => {
			flagSpy.mockReturnValue(false);

			const res = await request(app.getHttpServer())
				.post('/mcp')
				.set('Accept', 'application/json, text/event-stream')
				.set('Content-Type', 'application/json')
				.set('Host', 'localhost')
				.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

			expect(res.status).toBe(404);
		});
	});

	// =================== 定額提供確認（R8）===================

	describe('LLM 推論非呼出・定額提供確認（R8.1, R8.2, R8.3）', () => {
		it('MCP ソースファイルに LLM 推論ライブラリのインポートが含まれていないこと', async () => {
			const mcpDir = join(__dirname);
			const files = await glob('**/*.ts', { cwd: mcpDir, ignore: ['**/*.spec.ts'] });

			const llmPatterns = [
				/@anthropic-ai\//,
				/openai/,
				/gemini/,
				/@google\/generative-ai/,
				/langchain/,
				/llm/i,
			];

			const violations: string[] = [];
			for (const file of files) {
				const content = readFileSync(join(mcpDir, file), 'utf-8');
				for (const pattern of llmPatterns) {
					if (pattern.test(content)) {
						violations.push(`${file}: matches ${String(pattern)}`);
					}
				}
			}

			expect(violations).toHaveLength(0);
		});
	});
});
