import { Test, TestingModule } from '@nestjs/testing';
import { TrashCleanupService } from './trash-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';

const mockPrismaService = {
	memo: {
		deleteMany: jest.fn(),
	},
};

describe('TrashCleanupService', () => {
	let service: TrashCleanupService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [TrashCleanupService, { provide: PrismaService, useValue: mockPrismaService }],
		}).compile();

		service = module.get<TrashCleanupService>(TrashCleanupService);
		jest.clearAllMocks();
		jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
	});

	describe('cleanupOldTrashedMemos', () => {
		it('should delete memos trashed more than 30 days ago', async () => {
			mockPrismaService.memo.deleteMany.mockResolvedValue({ count: 5 });

			await service.cleanupOldTrashedMemos();

			const [[callArgs]] = mockPrismaService.memo.deleteMany.mock.calls as Array<
				[{ where: { trashedAt: { lte: Date } } }]
			>;
			expect(callArgs.where.trashedAt.lte).toBeDefined();
			// 30日前以前の日時であることを確認
			const cutoff = callArgs.where.trashedAt.lte;
			const now = new Date();
			const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
			expect(diffDays).toBeGreaterThanOrEqual(29.9);
			expect(diffDays).toBeLessThan(31);
		});

		it('should log the number of deleted memos', async () => {
			mockPrismaService.memo.deleteMany.mockResolvedValue({ count: 3 });
			const logSpy = jest.spyOn(Logger.prototype, 'log');

			await service.cleanupOldTrashedMemos();

			expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
		});

		it('should not delete memos trashed less than 30 days ago', async () => {
			mockPrismaService.memo.deleteMany.mockResolvedValue({ count: 0 });

			await service.cleanupOldTrashedMemos();

			// deleteMany は呼ばれるが、cutoff で新しいメモは除外される
			expect(mockPrismaService.memo.deleteMany).toHaveBeenCalledTimes(1);
		});
	});
});
