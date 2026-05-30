import { Test, TestingModule } from '@nestjs/testing';
import { MemoController } from './memo.controller';
import { MemoService } from './memo.service';
import { MemoSharingService } from './memo-sharing.service';
import type { AuthenticatedRequest } from '../auth/types';

const mockMemoService = {
	create: jest.fn(),
	findAll: jest.fn(),
	findAllPaginated: jest.fn(),
	search: jest.fn(),
	searchPaginated: jest.fn(),
	findOne: jest.fn(),
	update: jest.fn(),
	remove: jest.fn(),
	trash: jest.fn(),
	findTrashed: jest.fn(),
	restore: jest.fn(),
	permanentDelete: jest.fn(),
	emptyTrash: jest.fn(),
};

const mockMemoSharingService = {
	publishMemo: jest.fn(),
	unpublishMemo: jest.fn(),
	regenerateToken: jest.fn(),
	listMyPublicMemos: jest.fn(),
};

const mockReq = { user: { id: 'user-1' } } as unknown as AuthenticatedRequest;

describe('MemoController', () => {
	let controller: MemoController;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [MemoController],
			providers: [
				{ provide: MemoService, useValue: mockMemoService },
				{ provide: MemoSharingService, useValue: mockMemoSharingService },
			],
		}).compile();

		controller = module.get<MemoController>(MemoController);
		jest.clearAllMocks();
	});

	describe('DELETE /memos/:id (soft delete)', () => {
		it('should call memoService.trash() instead of remove()', async () => {
			const trashedMemo = { id: 'memo-1', trashedAt: new Date() };
			mockMemoService.trash.mockResolvedValue(trashedMemo);

			const result = await controller.remove('memo-1', mockReq);

			expect(mockMemoService.trash).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(mockMemoService.remove).not.toHaveBeenCalled();
			expect(result).toEqual(trashedMemo);
		});
	});

	describe('GET /memos/trash', () => {
		it('should return trashed memos for the user', async () => {
			const trashedMemos = [{ id: 'memo-1', trashedAt: new Date() }];
			mockMemoService.findTrashed.mockResolvedValue(trashedMemos);

			const result = await controller.findTrashed(mockReq);

			expect(mockMemoService.findTrashed).toHaveBeenCalledWith('user-1');
			expect(result).toEqual(trashedMemos);
		});
	});

	describe('PATCH /memos/:id/restore', () => {
		it('should restore a trashed memo', async () => {
			const restoredMemo = { id: 'memo-1', trashedAt: null };
			mockMemoService.restore.mockResolvedValue(restoredMemo);

			const result = await controller.restore('memo-1', mockReq);

			expect(mockMemoService.restore).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(result).toEqual(restoredMemo);
		});
	});

	describe('DELETE /memos/:id/permanent', () => {
		it('should permanently delete a trashed memo', async () => {
			const deletedMemo = { id: 'memo-1' };
			mockMemoService.permanentDelete.mockResolvedValue(deletedMemo);

			const result = await controller.permanentDelete('memo-1', mockReq);

			expect(mockMemoService.permanentDelete).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(result).toEqual(deletedMemo);
		});
	});

	describe('DELETE /memos/trash (empty trash)', () => {
		it('should empty the trash and return count', async () => {
			mockMemoService.emptyTrash.mockResolvedValue({ count: 3 });

			const result = await controller.emptyTrash(mockReq);

			expect(mockMemoService.emptyTrash).toHaveBeenCalledWith('user-1');
			expect(result).toEqual({ count: 3 });
		});
	});

	// ─── Public sharing endpoints (task 3.1) ─────────────────────────────

	describe('POST /memos/:id/share (publish)', () => {
		it('publish ユースケースに userId を渡し結果をそのまま返す', async () => {
			const published = {
				memoId: 'memo-1',
				publicToken: 'tok-abc',
				publishedAt: new Date('2026-05-30T10:00:00.000Z'),
			};
			mockMemoSharingService.publishMemo.mockResolvedValue(published);

			const result = await controller.publish('memo-1', mockReq);

			expect(mockMemoSharingService.publishMemo).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(result).toEqual(published);
		});
	});

	describe('DELETE /memos/:id/share (unpublish)', () => {
		it('unpublish ユースケースに userId を渡し成功フラグを返す', async () => {
			mockMemoSharingService.unpublishMemo.mockResolvedValue(undefined);

			const result = await controller.unpublish('memo-1', mockReq);

			expect(mockMemoSharingService.unpublishMemo).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(result).toEqual({ success: true });
		});
	});

	describe('POST /memos/:id/share/regenerate', () => {
		it('regenerateToken ユースケースに userId を渡し結果をそのまま返す', async () => {
			const regenerated = {
				memoId: 'memo-1',
				publicToken: 'tok-new',
				publishedAt: new Date('2026-05-30T11:00:00.000Z'),
			};
			mockMemoSharingService.regenerateToken.mockResolvedValue(regenerated);

			const result = await controller.regenerateShare('memo-1', mockReq);

			expect(mockMemoSharingService.regenerateToken).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(result).toEqual(regenerated);
		});
	});

	describe('GET /memos/me/public-memos', () => {
		it('自分の公開中メモ一覧をサービスから取得して返す', async () => {
			const list = [
				{
					memoId: 'memo-2',
					title: 'Memo 2',
					publicToken: 'tok2',
					publishedAt: new Date('2026-05-30T10:00:00.000Z'),
					updatedAt: new Date('2026-05-30T10:00:00.000Z'),
				},
			];
			mockMemoSharingService.listMyPublicMemos.mockResolvedValue(list);

			const result = await controller.listMyPublicMemos(mockReq);

			expect(mockMemoSharingService.listMyPublicMemos).toHaveBeenCalledWith('user-1');
			expect(result).toEqual(list);
		});
	});
});
