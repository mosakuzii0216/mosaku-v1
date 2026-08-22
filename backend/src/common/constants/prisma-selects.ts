/**
 * Common Prisma select objects to avoid duplication across services
 */

import type { Prisma } from '@prisma/client';

/**
 * Standard theme selection fields
 * Used when fetching theme data in responses
 */
export const THEME_SELECT = {
	id: true,
	name: true,
	styles: true,
	cssFilePath: true,
	// metadata（effectKey 等）を含めないと、ノートブック/メモ経由で取得したテーマから
	// getEffectKey() が effectKey を解決できず、没入エフェクト層（森など）が発火しない。
	metadata: true,
} as const satisfies Prisma.ThemeSelect;

/**
 * Notebook selection with nested theme
 * Used when including notebook data in memo responses
 */
export const NOTEBOOK_WITH_THEME_SELECT = {
	id: true,
	name: true,
	theme: {
		select: THEME_SELECT,
	},
} as const satisfies Prisma.NotebookSelect;
