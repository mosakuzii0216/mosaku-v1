import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { MemoService } from './memo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';

const mockMemo = (overrides = {}) => ({
	id: 'memo-1',
	title: 'Test Memo',
	content: 'Content',
	createdAt: new Date(),
	updatedAt: new Date(),
	trashedAt: null,
	userId: 'user-1',
	notebookId: null,
	memoTags: [],
	notebook: null,
	...overrides,
});

const mockPrismaService = {
	memo: {
		findFirst: jest.fn(),
		findMany: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
		deleteMany: jest.fn(),
		count: jest.fn(),
		create: jest.fn(),
	},
};

describe('MemoService', () => {
	let service: MemoService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MemoService,
				{ provide: PrismaService, useValue: mockPrismaService },
				AuthorizationService, // 実際の AuthorizationService を使用
			],
		}).compile();

		service = module.get<MemoService>(MemoService);
		jest.clearAllMocks();
	});

	// ─── trash() ────────────────────────────────────────────────────────────────

	describe('trash()', () => {
		it('should set trashedAt to current time', async () => {
			const memo = mockMemo();
			const trashedMemo = mockMemo({ trashedAt: new Date() });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);
			mockPrismaService.memo.update.mockResolvedValue(trashedMemo);

			const result = await service.trash('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { trashedAt: expect.any(Date) },
				}),
			);
			expect(result.trashedAt).not.toBeNull();
		});

		it('should throw 404 when memo does not exist', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.trash('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when memo belongs to another user', async () => {
			const memo = mockMemo({ userId: 'other-user' });
			mockPrismaService.memo.findFirst.mockResolvedValue(memo);

			await expect(service.trash('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});
	});

	// ─── findAll() ──────────────────────────────────────────────────────────────

	describe('findAll()', () => {
		it('should exclude trashed memos (trashedAt: null condition)', async () => {
			const activeMemo = mockMemo();
			mockPrismaService.memo.findMany.mockResolvedValue([activeMemo]);

			await service.findAll('user-1');

			const callArgs = mockPrismaService.memo.findMany.mock.calls[0][0];
			expect(callArgs.where).toMatchObject({ userId: 'user-1', trashedAt: null });
		});

		it('should not return memos with trashedAt set', async () => {
			// DB 側フィルターはモックで表現：findMany は空配列を返す（ゴミ箱メモのみの状況）
			mockPrismaService.memo.findMany.mockResolvedValue([]);

			const result = await service.findAll('user-1');

			expect(result).toHaveLength(0);
		});
	});

	// ─── restore() ──────────────────────────────────────────────────────────────

	describe('restore()', () => {
		it('should set trashedAt back to null', async () => {
			const trashedMemo = mockMemo({ trashedAt: new Date() });
			const restoredMemo = mockMemo({ trashedAt: null });
			mockPrismaService.memo.findFirst.mockResolvedValue(trashedMemo);
			mockPrismaService.memo.update.mockResolvedValue(restoredMemo);

			const result = await service.restore('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { trashedAt: null },
				}),
			);
			expect(result.trashedAt).toBeNull();
		});

		it('should throw 404 when trashed memo does not exist', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.restore('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when trashed memo belongs to another user', async () => {
			const trashedMemo = mockMemo({ trashedAt: new Date(), userId: 'other-user' });
			mockPrismaService.memo.findFirst.mockResolvedValue(trashedMemo);

			await expect(service.restore('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});
	});

	// ─── permanentDelete() ──────────────────────────────────────────────────────

	describe('permanentDelete()', () => {
		it('should throw 404 for non-existent trashed memo', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.permanentDelete('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when memo belongs to another user', async () => {
			const trashedMemo = mockMemo({ trashedAt: new Date(), userId: 'other-user' });
			mockPrismaService.memo.findFirst.mockResolvedValue(trashedMemo);

			await expect(service.permanentDelete('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});
	});

	// ─── emptyTrash() ───────────────────────────────────────────────────────────

	describe('emptyTrash()', () => {
		it('should delete all trashed memos for the user', async () => {
			mockPrismaService.memo.deleteMany.mockResolvedValue({ count: 5 });

			const result = await service.emptyTrash('user-1');

			expect(mockPrismaService.memo.deleteMany).toHaveBeenCalledWith({
				where: { userId: 'user-1', trashedAt: { not: null } },
			});
			expect(result.count).toBe(5);
		});
	});
});
