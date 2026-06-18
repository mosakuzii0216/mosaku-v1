import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { McpModule } from './mcp.module';
import * as features from '../config/features.config';
import { MCP_TOOL_NAMES } from './mcp.constants';
import { McpBearerGuard } from './auth/mcp-bearer.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * MCP Streamable HTTP 入口（McpController + McpServerService）の疎通テスト。
 * task 1.2（transport 結線・flag gating）と task 1.3（initialize / tools/list / 未知メソッド）を担保する。
 *
 * McpBearerGuard は McpTokenVerifier.spec.ts で完全にユニットテスト済みのため、
 * 本 integration spec では Always-pass スタブに差し替えてプロトコル挙動に集中する。
 * Bearer 検証の通過・拒否はそちらで担保する。
 */
describe('McpController (integration)', () => {
	let app: INestApplication;
	let flagSpy: jest.SpyInstance;

	const MCP_HEADERS = {
		// POST は application/json と text/event-stream の両方を Accept に要求される（SDK 仕様）
		Accept: 'application/json, text/event-stream',
		'Content-Type': 'application/json',
		// DNS rebinding 対策の allowedHosts に含まれる host を送る
		Host: 'localhost',
	};

	/** テスト用 Bearer Guard スタブ（常に通過・userId を注入）。 */
	const alwaysPassGuard: CanActivate = {
		canActivate: (ctx: ExecutionContext) => {
			const req = ctx.switchToHttp().getRequest<{ mcpUser?: unknown }>();
			req.mcpUser = { userId: 'test-user', scopes: ['memo:read', 'memo:write'] };
			return true;
		},
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			imports: [McpModule],
		})
			.overrideGuard(McpBearerGuard)
			.useValue(alwaysPassGuard)
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
		// 既定は flag ON。OFF 検証のテストで個別に上書きする
		flagSpy = jest.spyOn(features, 'isFeatureEnabled').mockReturnValue(true);
	});

	afterEach(() => {
		flagSpy.mockRestore();
	});

	function post(body: object) {
		return request(app.getHttpServer()).post('/mcp').set(MCP_HEADERS).send(body);
	}

	it('feature flag OFF のとき入口を無効化（404）し tool を実行しない', async () => {
		flagSpy.mockReturnValue(false);
		const res = await post({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: '2025-11-25',
				capabilities: {},
				clientInfo: { name: 'jest', version: '1.0.0' },
			},
		});
		expect(res.status).toBe(404);
	});

	it('initialize にサーバー情報と tools capability を含めて応答する', async () => {
		const res = await post({
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
		expect(res.body.result.serverInfo).toMatchObject({ name: 'mosaku-mcp' });
		expect(res.body.result.capabilities).toHaveProperty('tools');
		expect(res.body.result.protocolVersion).toBe('2025-11-25');
	});

	it('tools/list で create_memo / search_memos の name・説明・入力スキーマを返す', async () => {
		const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
		expect(res.status).toBe(200);
		const tools: Array<{ name: string; description?: string; inputSchema?: unknown }> =
			res.body.result.tools;
		const names = tools.map((t) => t.name);
		expect(names).toEqual(
			expect.arrayContaining([MCP_TOOL_NAMES.CREATE_MEMO, MCP_TOOL_NAMES.SEARCH_MEMOS]),
		);
		const createTool = tools.find((t) => t.name === MCP_TOOL_NAMES.CREATE_MEMO)!;
		expect(createTool.description).toBeTruthy();
		// content を必須プロパティに持つ入力スキーマが公開される
		expect(createTool.inputSchema).toMatchObject({
			type: 'object',
			required: expect.arrayContaining(['content']),
		});
	});

	it('未知メソッドには JSON-RPC エラー（method not found）を返す', async () => {
		const res = await post({
			jsonrpc: '2.0',
			id: 3,
			method: 'this/does_not_exist',
			params: {},
		});
		expect(res.status).toBe(200);
		expect(res.body.error).toBeDefined();
		// JSON-RPC: Method not found = -32601
		expect(res.body.error.code).toBe(-32601);
	});

	it('未知 tool の tools/call には MCP 準拠エラーを返す', async () => {
		const res = await post({
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: { name: 'no_such_tool', arguments: {} },
		});
		expect(res.status).toBe(200);
		// 未知 tool はエラー（JSON-RPC error もしくは isError 結果のいずれか）
		const isJsonRpcError = res.body.error !== undefined;
		const isToolError = res.body.result?.isError === true;
		expect(isJsonRpcError || isToolError).toBe(true);
	});

	it('不正な Host ヘッダ（DNS rebinding）を 403 で拒否する', async () => {
		const res = await request(app.getHttpServer())
			.post('/mcp')
			.set({ ...MCP_HEADERS, Host: 'evil.example.com' })
			.send({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} });
		expect(res.status).toBe(403);
	});
});
