import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ActivityDatesQueryDto } from './dto/activity-dates-query.dto';
import type { AuthenticatedRequest } from 'src/auth/types';

const mockDashboardService = {
	getRecentMemos: jest.fn(),
	getWeeklyMemoCount: jest.fn(),
	getActivityDates: jest.fn(),
	getNotebooksWithMemoCount: jest.fn(),
};

const mockReq = { user: { id: 'user-1' } } as unknown as AuthenticatedRequest;

describe('DashboardController', () => {
	let controller: DashboardController;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [DashboardController],
			providers: [{ provide: DashboardService, useValue: mockDashboardService }],
		}).compile();

		controller = module.get<DashboardController>(DashboardController);
		jest.clearAllMocks();
	});

	describe('GET /dashboard/recent-memos', () => {
		it('should call getRecentMemos with userId and limit 5', async () => {
			const expected = [{ id: '1', title: 'T', contentPreview: 'c', updatedAt: '' }];
			mockDashboardService.getRecentMemos.mockResolvedValue(expected);

			const result = await controller.getRecentMemos(mockReq);

			expect(mockDashboardService.getRecentMemos).toHaveBeenCalledWith('user-1', 5);
			expect(result).toEqual(expected);
		});
	});

	describe('GET /dashboard/weekly-count', () => {
		it('should call getWeeklyMemoCount with userId', async () => {
			const expected = { count: 3, weekStart: '2024-01-15', weekEnd: '2024-01-21' };
			mockDashboardService.getWeeklyMemoCount.mockResolvedValue(expected);

			const result = await controller.getWeeklyCount(mockReq);

			expect(mockDashboardService.getWeeklyMemoCount).toHaveBeenCalledWith('user-1');
			expect(result).toEqual(expected);
		});
	});

	describe('GET /dashboard/activity-dates', () => {
		it('should call getActivityDates with userId, from, and to', async () => {
			const expected = { dates: ['2024-01-10', '2024-01-12'] };
			mockDashboardService.getActivityDates.mockResolvedValue(expected);

			const result = await controller.getActivityDates(
				{ from: '2024-01-08', to: '2024-01-15' },
				mockReq,
			);

			expect(mockDashboardService.getActivityDates).toHaveBeenCalledWith(
				'user-1',
				'2024-01-08',
				'2024-01-15',
			);
			expect(result).toEqual(expected);
		});
	});

	describe('GET /dashboard/notebooks', () => {
		it('should call getNotebooksWithMemoCount with userId', async () => {
			const expected = [{ id: 'nb-1', name: 'Work', memoCount: 3 }];
			mockDashboardService.getNotebooksWithMemoCount.mockResolvedValue(expected);

			const result = await controller.getNotebooks(mockReq);

			expect(mockDashboardService.getNotebooksWithMemoCount).toHaveBeenCalledWith('user-1');
			expect(result).toEqual(expected);
		});
	});
});

describe('ActivityDatesQueryDto validation', () => {
	it('should pass validation with valid YYYY-MM-DD dates', async () => {
		const dto = Object.assign(new ActivityDatesQueryDto(), {
			from: '2024-01-08',
			to: '2024-01-15',
		});

		const errors = await validate(dto);

		expect(errors).toHaveLength(0);
	});

	it('should fail validation when from is not YYYY-MM-DD format', async () => {
		const dto = Object.assign(new ActivityDatesQueryDto(), {
			from: '2024/01/08',
			to: '2024-01-15',
		});

		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].property).toBe('from');
	});

	it('should fail validation when to is missing', async () => {
		const dto = Object.assign(new ActivityDatesQueryDto(), { from: '2024-01-08' });

		const errors = await validate(dto);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].property).toBe('to');
	});
});
