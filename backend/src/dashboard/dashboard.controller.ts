import { Controller, Get, Query, Request } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ActivityDatesQueryDto } from './dto/activity-dates-query.dto';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('dashboard')
export class DashboardController {
	constructor(private readonly dashboardService: DashboardService) {}

	@Get('recent-memos')
	getRecentMemos(@Request() req: AuthenticatedRequest) {
		return this.dashboardService.getRecentMemos(req.user.id, 5);
	}

	@Get('weekly-count')
	getWeeklyCount(@Request() req: AuthenticatedRequest) {
		return this.dashboardService.getWeeklyMemoCount(req.user.id);
	}

	@Get('activity-dates')
	getActivityDates(@Query() query: ActivityDatesQueryDto, @Request() req: AuthenticatedRequest) {
		return this.dashboardService.getActivityDates(req.user.id, query.from, query.to);
	}

	@Get('notebooks')
	getNotebooks(@Request() req: AuthenticatedRequest) {
		return this.dashboardService.getNotebooksWithMemoCount(req.user.id);
	}
}
