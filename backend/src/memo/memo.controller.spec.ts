import { Test, TestingModule } from '@nestjs/testing';
import { MemoController } from './memo.controller';
import { MemoService } from './memo.service';

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

const mockReq = { user: { id: 'user-1' } };

describe('MemoController', () => {
	let controller: MemoController;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [MemoController],
			providers: [{ provide: MemoService, useValue: mockMemoService }],
		}).compile();

		controller = module.get<MemoController>(MemoController);
		jest.clearAllMocks();
	});

	describe('DELETE /memos/:id (soft delete)', () => {
		it('should call memoService.trash() instead of remove()', async () => {
			const trashedMemo = { id: 'memo-1', trashedAt: new Date() };
			mockMemoService.trash.mockResolvedValue(trashedMemo);

			const result = await controller.remove('memo-1', mockReq as any);

			expect(mockMemoService.trash).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(mockMemoService.remove).not.toHaveBeenCalled();
			expect(result).toEqual(trashedMemo);
		});
	});

	describe('GET /memos/trash', () => {
		it('should return trashed memos for the user', async () => {
			const trashedMemos = [{ id: 'memo-1', trashedAt: new Date() }];
			mockMemoService.findTrashed.mockResolvedValue(trashedMemos);

			const result = await controller.findTrashed(mockReq as any);

			expect(mockMemoService.findTrashed).toHaveBeenCalledWith('user-1');
			expect(result).toEqual(trashedMemos);
		});
	});

	describe('PATCH /memos/:id/restore', () => {
		it('should restore a trashed memo', async () => {
			const restoredMemo = { id: 'memo-1', trashedAt: null };
			mockMemoService.restore.mockResolvedValue(restoredMemo);

			const result = await controller.restore('memo-1', mockReq as any);

			expect(mockMemoService.restore).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(result).toEqual(restoredMemo);
		});
	});

	describe('DELETE /memos/:id/permanent', () => {
		it('should permanently delete a trashed memo', async () => {
			const deletedMemo = { id: 'memo-1' };
			mockMemoService.permanentDelete.mockResolvedValue(deletedMemo);

			const result = await controller.permanentDelete('memo-1', mockReq as any);

			expect(mockMemoService.permanentDelete).toHaveBeenCalledWith('memo-1', 'user-1');
			expect(result).toEqual(deletedMemo);
		});
	});

	describe('DELETE /memos/trash (empty trash)', () => {
		it('should empty the trash and return count', async () => {
			mockMemoService.emptyTrash.mockResolvedValue({ count: 3 });

			const result = await controller.emptyTrash(mockReq as any);

			expect(mockMemoService.emptyTrash).toHaveBeenCalledWith('user-1');
			expect(result).toEqual({ count: 3 });
		});
	});
});
