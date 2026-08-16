import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CreateMemoTool } from './create-memo.tool';
import { MemoService } from '../../memo/memo.service';
import { NotebookService } from '../../notebook/notebook.service';
import type { AuthenticatedMcpUser } from '../auth/mcp-token.verifier';

const USER_WRITE: AuthenticatedMcpUser = {
	userId: 'user-1',
	scopes: ['memo:write'],
};

const USER_READ_ONLY: AuthenticatedMcpUser = {
	userId: 'user-1',
	scopes: ['memo:read'],
};

describe('CreateMemoTool', () => {
	let tool: CreateMemoTool;
	const mockMemoService = { create: jest.fn() };
	const mockNotebookService = { findOne: jest.fn() };

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CreateMemoTool,
				{ provide: MemoService, useValue: mockMemoService },
				{ provide: NotebookService, useValue: mockNotebookService },
			],
		}).compile();

		tool = module.get(CreateMemoTool);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(tool).toBeDefined();
	});

	describe('scope check', () => {
		it('should return error result when memo:write scope is missing', async () => {
			const result = await tool.execute({ content: 'hello' }, USER_READ_ONLY);

			expect(result.isError).toBe(true);
			expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
				'insufficient_scope',
			);
			expect(mockMemoService.create).not.toHaveBeenCalled();
		});
	});

	describe('content validation', () => {
		it('should return error result when content is empty string', async () => {
			const result = await tool.execute({ content: '' }, USER_WRITE);

			expect(result.isError).toBe(true);
			expect((result.content[0] as { type: 'text'; text: string }).text).toContain('content');
			expect(mockMemoService.create).not.toHaveBeenCalled();
		});

		it('should return error result when content is whitespace only', async () => {
			const result = await tool.execute({ content: '   ' }, USER_WRITE);

			expect(result.isError).toBe(true);
			expect(mockMemoService.create).not.toHaveBeenCalled();
		});
	});

	describe('notebook resolution', () => {
		it('should return error result when notebook is not found', async () => {
			mockNotebookService.findOne.mockRejectedValue(new NotFoundException('Notebook not found'));

			const result = await tool.execute({ content: 'hello', notebook: 'nb-999' }, USER_WRITE);

			expect(result.isError).toBe(true);
			expect((result.content[0] as { type: 'text'; text: string }).text).toContain('notebook');
			expect(mockMemoService.create).not.toHaveBeenCalled();
		});

		it('should return error result when notebook belongs to another user', async () => {
			mockNotebookService.findOne.mockRejectedValue(new ForbiddenException('Forbidden'));

			const result = await tool.execute({ content: 'hello', notebook: 'nb-other' }, USER_WRITE);

			expect(result.isError).toBe(true);
			expect(mockMemoService.create).not.toHaveBeenCalled();
		});

		it('should create memo with notebookId when notebook is valid and owned', async () => {
			mockNotebookService.findOne.mockResolvedValue({ id: 'nb-1' });
			mockMemoService.create.mockResolvedValue({ id: 'memo-1', title: 'test', notebookId: 'nb-1' });

			const result = await tool.execute({ content: 'hello', notebook: 'nb-1' }, USER_WRITE);

			expect(result.isError).toBeUndefined();
			expect(mockNotebookService.findOne).toHaveBeenCalledWith('nb-1', 'user-1');
			expect(mockMemoService.create).toHaveBeenCalledWith(
				expect.objectContaining({ notebookId: 'nb-1' }),
				'user-1',
			);
		});

		it('should create memo with notebookId=null when notebook is not specified', async () => {
			mockMemoService.create.mockResolvedValue({ id: 'memo-1', title: 'test', notebookId: null });

			const result = await tool.execute({ content: 'hello' }, USER_WRITE);

			expect(result.isError).toBeUndefined();
			expect(mockNotebookService.findOne).not.toHaveBeenCalled();
			expect(mockMemoService.create).toHaveBeenCalledWith(
				expect.objectContaining({ notebookId: undefined }),
				'user-1',
			);
		});
	});

	describe('title generation', () => {
		it('should use first line of content trimmed to title (≤80 chars)', async () => {
			mockMemoService.create.mockResolvedValue({
				id: 'memo-1',
				title: '壁打ち結果',
				notebookId: null,
			});

			await tool.execute({ content: '壁打ち結果\n詳細内容...' }, USER_WRITE);

			expect(mockMemoService.create).toHaveBeenCalledWith(
				expect.objectContaining({ title: '壁打ち結果' }),
				'user-1',
			);
		});

		it('should truncate title to 80 chars', async () => {
			const longLine = 'あ'.repeat(100);
			mockMemoService.create.mockResolvedValue({
				id: 'memo-1',
				title: 'あ'.repeat(80),
				notebookId: null,
			});

			await tool.execute({ content: longLine }, USER_WRITE);

			const callArg = (mockMemoService.create.mock.calls as Array<[{ title: string }]>)[0][0];
			expect(Array.from(callArg.title).length).toBeLessThanOrEqual(80);
		});

		it('should fallback to "MCP メモ YYYY-MM-DD" when first line is blank', async () => {
			mockMemoService.create.mockResolvedValue({
				id: 'memo-1',
				title: 'MCP メモ 2026-06-17',
				notebookId: null,
			});

			await tool.execute({ content: '\n詳細内容' }, USER_WRITE);

			const callArg = (mockMemoService.create.mock.calls as Array<[{ title: string }]>)[0][0];
			expect(callArg.title).toMatch(/^MCP メモ \d{4}-\d{2}-\d{2}$/);
		});

		it('should trim whitespace from first line for title', async () => {
			mockMemoService.create.mockResolvedValue({
				id: 'memo-1',
				title: 'タイトル',
				notebookId: null,
			});

			await tool.execute({ content: '  タイトル  \n本文' }, USER_WRITE);

			const callArg = (mockMemoService.create.mock.calls as Array<[{ title: string }]>)[0][0];
			expect(callArg.title).toBe('タイトル');
		});
	});

	describe('success result', () => {
		it('should return memoId, title, notebookId in result text', async () => {
			mockMemoService.create.mockResolvedValue({ id: 'memo-42', title: 'hello', notebookId: null });

			const result = await tool.execute({ content: 'hello' }, USER_WRITE);

			const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text) as {
				memoId: string;
				title: string;
				notebookId: null;
			};
			expect(parsed.memoId).toBe('memo-42');
			expect(parsed.title).toBe('hello');
			expect(parsed.notebookId).toBeNull();
		});
	});

	describe('unexpected exception handling', () => {
		it('should catch unexpected DB error and return sanitized error result (not propagate)', async () => {
			mockMemoService.create.mockRejectedValue(
				new Error('Connection refused to PostgreSQL: password=secret123'),
			);

			const result = await tool.execute({ content: 'hello' }, USER_WRITE);

			expect(result.isError).toBe(true);
			const text = (result.content[0] as { type: 'text'; text: string }).text;
			// 内部スタック・接続情報は露出しない（R7.1）
			expect(text).not.toContain('PostgreSQL');
			expect(text).not.toContain('password=');
		});
	});
});
