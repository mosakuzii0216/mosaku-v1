import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrismaService = {
	memo: {
		findMany: jest.fn(),
		count: jest.fn(),
	},
	notebook: {
		findMany: jest.fn(),
	},
};

describe('DashboardService', () => {
	let service: DashboardService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [DashboardService, { provide: PrismaService, useValue: mockPrismaService }],
		}).compile();

		service = module.get<DashboardService>(DashboardService);
		jest.clearAllMocks();
	});

	describe('getRecentMemos()', () => {
		it('should query with trashedAt: null, orderBy updatedAt desc, and take limit', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([]);

			await service.getRecentMemos('user-1', 5);

			expect(mockPrismaService.memo.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userId: 'user-1', trashedAt: null },
					orderBy: { updatedAt: 'desc' },
					take: 5,
				}),
			);
		});

		it('should truncate content to 100 chars as contentPreview', async () => {
			const longContent = 'a'.repeat(200);
			mockPrismaService.memo.findMany.mockResolvedValue([
				{ id: '1', title: 'Test', content: longContent, updatedAt: new Date('2024-01-01') },
			]);

			const result = await service.getRecentMemos('user-1', 5);

			expect(result[0].contentPreview).toHaveLength(100);
			expect(result[0].contentPreview).toBe('a'.repeat(100));
		});

		it('should return updatedAt as ISO string', async () => {
			const updatedAt = new Date('2024-01-15T10:00:00Z');
			mockPrismaService.memo.findMany.mockResolvedValue([
				{ id: '1', title: 'T', content: 'c', updatedAt },
			]);

			const result = await service.getRecentMemos('user-1', 5);

			expect(result[0].updatedAt).toBe(updatedAt.toISOString());
		});
	});

	describe('getWeeklyMemoCount()', () => {
		it('should count memos with updatedAt within JST week boundaries (Mon 00:00 ~ next Mon 00:00)', async () => {
			// 2024-01-18 10:00 JST (Thursday) = 2024-01-18T01:00:00Z
			jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-18T01:00:00Z').getTime());
			mockPrismaService.memo.count.mockResolvedValue(3);

			const result = await service.getWeeklyMemoCount('user-1');

			// Monday 2024-01-15 00:00 JST = 2024-01-14T15:00:00Z
			// Next Monday 2024-01-22 00:00 JST = 2024-01-21T15:00:00Z
			expect(mockPrismaService.memo.count).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						userId: 'user-1',
						trashedAt: null,
						updatedAt: {
							gte: new Date('2024-01-14T15:00:00.000Z'),
							lt: new Date('2024-01-21T15:00:00.000Z'),
						},
					}),
				}),
			);
			expect(result.count).toBe(3);
		});

		it('should return weekStart as Monday and weekEnd as Sunday in YYYY-MM-DD (JST)', async () => {
			jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-18T01:00:00Z').getTime());
			mockPrismaService.memo.count.mockResolvedValue(0);

			const result = await service.getWeeklyMemoCount('user-1');

			expect(result.weekStart).toBe('2024-01-15');
			expect(result.weekEnd).toBe('2024-01-21');
		});

		it('should return count 0 when no memos in current week', async () => {
			jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-18T01:00:00Z').getTime());
			mockPrismaService.memo.count.mockResolvedValue(0);

			const result = await service.getWeeklyMemoCount('user-1');

			expect(result.count).toBe(0);
		});

		it('should handle Sunday correctly (day 0) as last day of week', async () => {
			// 2024-01-21 12:00 JST (Sunday) = 2024-01-21T03:00:00Z
			jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-21T03:00:00Z').getTime());
			mockPrismaService.memo.count.mockResolvedValue(1);

			const result = await service.getWeeklyMemoCount('user-1');

			expect(result.weekStart).toBe('2024-01-15');
			expect(result.weekEnd).toBe('2024-01-21');
		});
	});

	describe('getActivityDates()', () => {
		it('should collect dates from both createdAt and updatedAt', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([
				{
					// 2024-01-10 14:00 JST → "2024-01-10"
					createdAt: new Date('2024-01-10T05:00:00Z'),
					// 2024-01-12 19:00 JST → "2024-01-12"
					updatedAt: new Date('2024-01-12T10:00:00Z'),
				},
			]);

			const result = await service.getActivityDates('user-1', '2024-01-08', '2024-01-15');

			expect(result.dates).toContain('2024-01-10');
			expect(result.dates).toContain('2024-01-12');
		});

		it('should deduplicate dates when createdAt and updatedAt fall on the same JST day', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([
				{
					// Both on 2024-01-10 JST
					createdAt: new Date('2024-01-10T05:00:00Z'), // 14:00 JST
					updatedAt: new Date('2024-01-10T08:00:00Z'), // 17:00 JST
				},
			]);

			const result = await service.getActivityDates('user-1', '2024-01-08', '2024-01-15');

			expect(result.dates).toEqual(['2024-01-10']);
		});

		it('should return dates in ascending order', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([
				{
					createdAt: new Date('2024-01-10T05:00:00Z'),
					updatedAt: new Date('2024-01-08T10:00:00Z'),
				},
				{
					createdAt: new Date('2024-01-09T05:00:00Z'),
					updatedAt: new Date('2024-01-11T10:00:00Z'),
				},
			]);

			const result = await service.getActivityDates('user-1', '2024-01-08', '2024-01-15');

			expect(result.dates).toEqual(['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11']);
		});

		it('should query with userId filter and trashedAt: null', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([]);

			await service.getActivityDates('user-1', '2024-01-08', '2024-01-15');

			expect(mockPrismaService.memo.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						userId: 'user-1',
						trashedAt: null,
					}),
				}),
			);
		});
	});

	describe('getNotebooksWithMemoCount()', () => {
		it('should count only non-trashed memos using _count with trashedAt: null filter', async () => {
			mockPrismaService.notebook.findMany.mockResolvedValue([
				{ id: 'nb-1', name: 'Work', _count: { memos: 3 } },
			]);

			await service.getNotebooksWithMemoCount('user-1');

			expect(mockPrismaService.notebook.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userId: 'user-1' },
					select: expect.objectContaining({
						_count: {
							select: {
								memos: { where: { trashedAt: null } },
							},
						},
					}),
				}),
			);
		});

		it('should map _count.memos to memoCount field', async () => {
			mockPrismaService.notebook.findMany.mockResolvedValue([
				{ id: 'nb-1', name: 'Work', _count: { memos: 3 } },
				{ id: 'nb-2', name: null, _count: { memos: 0 } },
			]);

			const result = await service.getNotebooksWithMemoCount('user-1');

			expect(result).toEqual([
				{ id: 'nb-1', name: 'Work', memoCount: 3 },
				{ id: 'nb-2', name: null, memoCount: 0 },
			]);
		});
	});
});
