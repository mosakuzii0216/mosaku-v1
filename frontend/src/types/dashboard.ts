export type RecentMemoDto = {
	id: string;
	title: string;
	contentPreview: string;
	updatedAt: string;
};

export type WeeklyCountDto = {
	count: number;
	weekStart: string;
	weekEnd: string;
};

export type ActivityDatesDto = {
	dates: string[];
};

export type NotebookWithMemoCountDto = {
	id: string;
	name: string | null;
	memoCount: number;
};
