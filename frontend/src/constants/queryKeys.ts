/**
 * React Query用の統一されたクエリキー定義
 *
 * このファイルでは、アプリケーション全体で使用するクエリキーを一元管理します。
 * 階層的な構造により、関連するクエリのキャッシュ無効化が容易になります。
 */

import type { ThemeSearchParams } from '../types/theme';

export const queryKeys = {
	memos: {
		all: ['memos'] as const,
		lists: () => [...queryKeys.memos.all, 'list'] as const,
		list: (tagIds?: string[]) => [...queryKeys.memos.lists(), { tagIds }] as const,
		details: () => [...queryKeys.memos.all, 'detail'] as const,
		detail: (id: string) => [...queryKeys.memos.details(), id] as const,
		searches: () => [...queryKeys.memos.all, 'search'] as const,
		search: (query: string, tagIds?: string[]) =>
			[...queryKeys.memos.searches(), query, { tagIds }] as const,
		trash: () => [...queryKeys.memos.all, 'trash'] as const,
	},

	notebooks: {
		all: ['notebooks'] as const,
		details: () => [...queryKeys.notebooks.all, 'detail'] as const,
		detail: (id: string) => [...queryKeys.notebooks.details(), id] as const,
	},

	tags: {
		all: ['tags'] as const,
		searches: () => [...queryKeys.tags.all, 'search'] as const,
		search: (query: string) => [...queryKeys.tags.searches(), query] as const,
	},

	themes: {
		all: ['themes'] as const,
		lists: () => [...queryKeys.themes.all, 'list'] as const,
		list: (params?: ThemeSearchParams) => [...queryKeys.themes.lists(), params] as const,
		details: () => [...queryKeys.themes.all, 'detail'] as const,
		detail: (id: string) => [...queryKeys.themes.details(), id] as const,
		system: () => [...queryKeys.themes.all, 'system'] as const,
		public: () => [...queryKeys.themes.all, 'public'] as const,
		category: (category: string) => [...queryKeys.themes.all, 'category', category] as const,
		favorites: () => [...queryKeys.themes.all, 'favorites'] as const,
	},
} as const;
