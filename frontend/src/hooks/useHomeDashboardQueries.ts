import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../utils/api';
import { queryKeys } from '../constants/queryKeys';
import { ENTITY_CACHE_CONFIG } from '../constants/cacheConfig';
import type {
	RecentMemoDto,
	WeeklyCountDto,
	ActivityDatesDto,
	NotebookWithMemoCountDto,
} from '../types/dashboard';
import type { ApiError } from '../utils/apiError';

export function useRecentMemos() {
	return useQuery<RecentMemoDto[], ApiError>({
		queryKey: queryKeys.dashboard.recentMemos(),
		queryFn: () => apiClient.getDashboardRecentMemos(),
		...ENTITY_CACHE_CONFIG.memos.list,
	});
}

export function useWeeklyMemoCount() {
	return useQuery<WeeklyCountDto, ApiError>({
		queryKey: queryKeys.dashboard.weeklyCount(),
		queryFn: () => apiClient.getDashboardWeeklyCount(),
		staleTime: ENTITY_CACHE_CONFIG.notebooks.list.staleTime,
		gcTime: ENTITY_CACHE_CONFIG.notebooks.list.gcTime,
	});
}

export function useActivityDates(from: string, to: string) {
	return useQuery<ActivityDatesDto, ApiError>({
		queryKey: queryKeys.dashboard.activityDates(from, to),
		queryFn: () => apiClient.getDashboardActivityDates(from, to),
		staleTime: ENTITY_CACHE_CONFIG.notebooks.list.staleTime,
		gcTime: ENTITY_CACHE_CONFIG.notebooks.list.gcTime,
	});
}

export function useHomeDashboardNotebooks() {
	return useQuery<NotebookWithMemoCountDto[], ApiError>({
		queryKey: queryKeys.dashboard.notebooks(),
		queryFn: () => apiClient.getDashboardNotebooks(),
		staleTime: ENTITY_CACHE_CONFIG.notebooks.list.staleTime,
		gcTime: ENTITY_CACHE_CONFIG.notebooks.list.gcTime,
	});
}
