import { Test, TestingModule } from '@nestjs/testing';
import { SearchMemosTool } from './search-memos.tool';
import { MemoService } from '../../memo/memo.service';
import type { AuthenticatedMcpUser } from '../auth/mcp-token.verifier';

const USER_READ: AuthenticatedMcpUser = {
	userId: 'user-1',
	scopes: ['memo:read'],
};

const USER_WRITE_ONLY: AuthenticatedMcpUser = {
	userId: 'user-1',
	scopes: ['memo:write'],
};

const makeMemo = (id: string, contentText = 'memo content', notebookId: string | null = null) => ({
	id,
	title: `title-${id}`,
	content: { type: 'doc', content: [{ type: 'paragraph' }] },
	contentText,
	notebookId,
	updatedAt: new Date('2026-06-17T00:00:00Z'),
	trashedAt: null,
	userId: 'user-1',
});

const makePaginatedResult = (memos: ReturnType<typeof makeMemo>[]) => ({
	data: memos,
	pagination: {
		page: 1,
		limit: 20,
		total: memos.length,
		totalPages: 1,
		hasNextPage: false,
		hasPrevPage: false,
	},
});

describe('SearchMemosTool', () => {
	let tool: SearchMemosTool;
	const mockMemoService = { searchPaginated: jest.fn() };

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [SearchMemosTool, { provide: MemoService, useValue: mockMemoService }],
		}).compile();

		tool = module.get(SearchMemosTool);
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(tool).toBeDefined();
	});

	describe('scope check', () => {
		it('should return error result when memo:read scope is missing', async () => {
			const result = await tool.execute({ query: 'test' }, USER_WRITE_ONLY);

			expect(result.isError).toBe(true);
			expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
				'insufficient_scope',
			);
			expect(mockMemoService.searchPaginated).not.toHaveBeenCalled();
		});
	});

	describe('userId filtering', () => {
		it('should pass userId to MemoService so only owned memos are searched', async () => {
			mockMemoService.searchPaginated.mockResolvedValue(makePaginatedResult([]));

			await tool.execute({ query: 'test' }, USER_READ);

			expect(mockMemoService.searchPaginated).toHaveBeenCalledWith(
				'test',
				'user-1',
				expect.objectContaining({ page: 1, limit: 20 }),
			);
		});
	});

	describe('empty results', () => {
		it('should return empty memos array as normal response (not error)', async () => {
			mockMemoService.searchPaginated.mockResolvedValue(makePaginatedResult([]));

			const result = await tool.execute({ query: 'nothinghere' }, USER_READ);

			expect(result.isError).toBeUndefined();
			const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text) as {
				memos: unknown[];
				total: number;
			};
			expect(parsed.memos).toHaveLength(0);
			expect(parsed.total).toBe(0);
		});
	});

	describe('result limit', () => {
		it('should request at most 20 results from MemoService', async () => {
			mockMemoService.searchPaginated.mockResolvedValue(makePaginatedResult([]));

			await tool.execute({ query: 'test' }, USER_READ);

			expect(mockMemoService.searchPaginated).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(String),
				expect.objectContaining({ limit: 20 }),
			);
		});
	});

	describe('excerpt', () => {
		it('should truncate excerpt to 300 chars (contentText ベース)', async () => {
			const longContentText = 'a'.repeat(500);
			mockMemoService.searchPaginated.mockResolvedValue(
				makePaginatedResult([makeMemo('m1', longContentText)]),
			);

			const result = await tool.execute({ query: 'a' }, USER_READ);

			const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text) as {
				memos: Array<{ excerpt: string }>;
			};
			expect(parsed.memos[0].excerpt.length).toBeLessThanOrEqual(300);
		});

		it('should include full content as excerpt when within 300 chars', async () => {
			mockMemoService.searchPaginated.mockResolvedValue(
				makePaginatedResult([makeMemo('m1', 'short')]),
			);

			const result = await tool.execute({ query: 'short' }, USER_READ);

			const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text) as {
				memos: Array<{ excerpt: string }>;
			};
			expect(parsed.memos[0].excerpt).toBe('short');
		});
	});

	describe('result shape', () => {
		it('should return memoId, title, excerpt, notebookId, updatedAt for each memo', async () => {
			mockMemoService.searchPaginated.mockResolvedValue(
				makePaginatedResult([makeMemo('m1', 'content here', 'nb-1')]),
			);

			const result = await tool.execute({ query: 'content' }, USER_READ);

			const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text) as {
				memos: Array<{
					memoId: string;
					title: string;
					excerpt: string;
					notebookId: string;
					updatedAt: string;
				}>;
			};
			const memo = parsed.memos[0];
			expect(memo.memoId).toBe('m1');
			expect(memo.title).toBe('title-m1');
			expect(memo.excerpt).toBe('content here');
			expect(memo.notebookId).toBe('nb-1');
			expect(memo.updatedAt).toBe('2026-06-17T00:00:00.000Z');
		});
	});

	describe('unexpected exception handling', () => {
		it('should catch unexpected DB error and return sanitized error result (not propagate)', async () => {
			mockMemoService.searchPaginated.mockRejectedValue(
				new Error('Connection refused: host=db.internal token=abc123'),
			);

			const result = await tool.execute({ query: 'test' }, USER_READ);

			expect(result.isError).toBe(true);
			const text = (result.content[0] as { type: 'text'; text: string }).text;
			// 内部情報（DB ホスト・トークン）は露出しない（R7.1）
			expect(text).not.toContain('db.internal');
			expect(text).not.toContain('token=');
		});
	});
});
