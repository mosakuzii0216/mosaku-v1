import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RecentMemoDto {
	id: string;
	title: string;
	contentPreview: string;
	updatedAt: string;
}

export interface WeeklyCountDto {
	count: number;
	weekStart: string;
	weekEnd: string;
}

export interface ActivityDatesDto {
	dates: string[];
}

export interface NotebookWithMemoCountDto {
	id: string;
	name: string | null;
	memoCount: number;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJstDateStr(date: Date): string {
	const jst = new Date(date.getTime() + JST_OFFSET_MS);
	return jst.toISOString().slice(0, 10);
}

@Injectable()
export class DashboardService {
	constructor(private readonly prisma: PrismaService) {}

	async getRecentMemos(userId: string, limit: number): Promise<RecentMemoDto[]> {
		const memos = await this.prisma.memo.findMany({
			where: { userId, trashedAt: null },
			orderBy: { updatedAt: 'desc' },
			take: limit,
			select: { id: true, title: true, content: true, updatedAt: true },
		});

		return memos.map((m) => ({
			id: m.id,
			title: m.title,
			contentPreview: m.content.slice(0, 100),
			updatedAt: m.updatedAt.toISOString(),
		}));
	}

	async getWeeklyMemoCount(userId: string): Promise<WeeklyCountDto> {
		const nowJst = new Date(Date.now() + JST_OFFSET_MS);

		const dayOfWeek = nowJst.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
		const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

		const mondayJst = new Date(nowJst);
		mondayJst.setUTCDate(nowJst.getUTCDate() - daysFromMonday);
		mondayJst.setUTCHours(0, 0, 0, 0);

		// Monday 00:00 JST → UTC (subtract 9h offset)
		const weekStart = new Date(mondayJst.getTime() - JST_OFFSET_MS);
		// Next Monday 00:00 JST → UTC
		const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

		const weekStartStr = mondayJst.toISOString().slice(0, 10);
		const sundayJst = new Date(mondayJst.getTime() + 6 * 24 * 60 * 60 * 1000);
		const weekEndStr = sundayJst.toISOString().slice(0, 10);

		const count = await this.prisma.memo.count({
			where: {
				userId,
				trashedAt: null,
				updatedAt: { gte: weekStart, lt: weekEnd },
			},
		});

		return { count, weekStart: weekStartStr, weekEnd: weekEndStr };
	}

	async getActivityDates(userId: string, from: string, to: string): Promise<ActivityDatesDto> {
		// from/to are YYYY-MM-DD in JST; convert to UTC boundaries
		const fromUtc = new Date(`${from}T00:00:00+09:00`);
		const [toYear, toMonth, toDay] = to.split('-').map(Number);
		const toEndUtc = new Date(Date.UTC(toYear, toMonth - 1, toDay + 1) - JST_OFFSET_MS);

		const memos = await this.prisma.memo.findMany({
			where: {
				userId,
				trashedAt: null,
				OR: [
					{ createdAt: { gte: fromUtc, lt: toEndUtc } },
					{ updatedAt: { gte: fromUtc, lt: toEndUtc } },
				],
			},
			select: { createdAt: true, updatedAt: true },
		});

		const dateSet = new Set<string>();
		for (const memo of memos) {
			const createdDate = toJstDateStr(memo.createdAt);
			const updatedDate = toJstDateStr(memo.updatedAt);
			if (createdDate >= from && createdDate <= to) dateSet.add(createdDate);
			if (updatedDate >= from && updatedDate <= to) dateSet.add(updatedDate);
		}

		return { dates: [...dateSet].sort() };
	}

	async getNotebooksWithMemoCount(userId: string): Promise<NotebookWithMemoCountDto[]> {
		const notebooks = await this.prisma.notebook.findMany({
			where: { userId },
			select: {
				id: true,
				name: true,
				_count: {
					select: {
						memos: { where: { trashedAt: null } },
					},
				},
			},
		});

		return notebooks.map((nb) => ({
			id: nb.id,
			name: nb.name,
			memoCount: nb._count.memos,
		}));
	}
}
