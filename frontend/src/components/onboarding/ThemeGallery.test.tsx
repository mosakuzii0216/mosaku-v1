import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { Theme } from '../../types/theme';

const mockThemes: Theme[] = [
	{
		id: 'ao',
		name: 'AO',
		description: null,
		isSystem: true,
		isPublic: true,
		cssFilePath: 'ao/ao.css',
		metadata: { previewColor: '#1C5DB6' },
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		createdById: null,
		favoriteCount: 0,
		usageCount: 0,
	},
	{
		id: 'mori',
		name: '森',
		description: null,
		isSystem: true,
		isPublic: true,
		cssFilePath: 'mori/mori.css',
		metadata: { previewColor: '#15803D' },
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		createdById: null,
		favoriteCount: 0,
		usageCount: 0,
	},
];

const mockUseSystemThemes = vi.fn();
const mockSetSelectedThemeId = vi.fn();
let mockSelectedThemeId: string | null = null;

vi.mock('../../hooks/useThemeQueries', () => ({
	useSystemThemes: () => mockUseSystemThemes(),
}));

vi.mock('../../stores/useOnboardingStore', () => ({
	useOnboardingStore: (
		selector: (s: {
			selectedThemeId: string | null;
			setSelectedThemeId: (id: string | null) => void;
		}) => unknown,
	) =>
		selector({ selectedThemeId: mockSelectedThemeId, setSelectedThemeId: mockSetSelectedThemeId }),
}));

import { ThemeGallery } from './ThemeGallery';

describe('ThemeGallery', () => {
	beforeEach(() => {
		mockSetSelectedThemeId.mockClear();
		mockSelectedThemeId = null;
	});

	it('テーマ取得中はスケルトンを表示する', () => {
		mockUseSystemThemes.mockReturnValue({ data: undefined, isLoading: true });
		const { container } = render(<ThemeGallery />);
		const skeletons = container.querySelectorAll('[data-testid="theme-skeleton"]');
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it('テーマ一覧をグリッドで表示する', () => {
		mockUseSystemThemes.mockReturnValue({ data: mockThemes, isLoading: false });
		render(<ThemeGallery />);
		expect(screen.getByText('AO')).toBeTruthy();
		expect(screen.getByText('森')).toBeTruthy();
	});

	it('テーマカードの数がテーマ数と一致する', () => {
		mockUseSystemThemes.mockReturnValue({ data: mockThemes, isLoading: false });
		const { container } = render(<ThemeGallery />);
		const cards = container.querySelectorAll('[data-testid="theme-preview-card"]');
		expect(cards.length).toBe(2);
	});

	it('グリッドは grid-cols-2 から始まるレスポンシブクラスを持つ', () => {
		mockUseSystemThemes.mockReturnValue({ data: mockThemes, isLoading: false });
		const { container } = render(<ThemeGallery />);
		const grid = container.querySelector('[data-testid="theme-gallery-grid"]');
		expect(grid?.className).toContain('grid-cols-2');
		expect(grid?.className).toContain('sm:grid-cols-3');
		expect(grid?.className).toContain('lg:grid-cols-5');
	});

	it('選択済みテーマは isSelected=true で表示される', () => {
		mockSelectedThemeId = 'ao';
		mockUseSystemThemes.mockReturnValue({ data: mockThemes, isLoading: false });
		const { container } = render(<ThemeGallery />);
		const cards = container.querySelectorAll('[data-testid="theme-preview-card"]');
		const selectedCard = Array.from(cards).find((c) => c.className.includes('ring-2'));
		expect(selectedCard).toBeTruthy();
	});
});
