import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemePreviewCard } from './ThemePreviewCard';
import type { Theme } from '../../types/theme';

const makeTheme = (overrides: Partial<Theme> = {}): Theme => ({
	id: 'theme-1',
	name: 'テストテーマ',
	description: null,
	isSystem: true,
	isPublic: true,
	cssFilePath: 'test/test.css',
	metadata: { previewColor: '#1C5DB6' },
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-01-01T00:00:00Z',
	createdById: null,
	favoriteCount: 0,
	usageCount: 0,
	...overrides,
});

describe('ThemePreviewCard', () => {
	it('テーマ名を表示する', () => {
		render(<ThemePreviewCard theme={makeTheme()} isSelected={false} onSelect={vi.fn()} />);
		expect(screen.getByText('テストテーマ')).toBeTruthy();
	});

	it('previewColor を色チップとして表示する', () => {
		const { container } = render(
			<ThemePreviewCard theme={makeTheme()} isSelected={false} onSelect={vi.fn()} />,
		);
		const chip = container.querySelector('[data-testid="color-chip"]');
		expect(chip).toBeTruthy();
		expect((chip as HTMLElement).style.backgroundColor).toBe('rgb(28, 93, 182)');
	});

	it('previewColor がない場合はフォールバック色を表示する', () => {
		const { container } = render(
			<ThemePreviewCard
				theme={makeTheme({ metadata: undefined })}
				isSelected={false}
				onSelect={vi.fn()}
			/>,
		);
		const chip = container.querySelector('[data-testid="color-chip"]');
		expect(chip).toBeTruthy();
	});

	it('isSelected=true のとき選択状態のビジュアルフィードバックを示す', () => {
		const { container } = render(
			<ThemePreviewCard theme={makeTheme()} isSelected={true} onSelect={vi.fn()} />,
		);
		const card = container.querySelector('[data-testid="theme-preview-card"]');
		expect(card?.className).toContain('ring-2');
	});

	it('isSelected=false のとき選択状態のビジュアルフィードバックを示さない', () => {
		const { container } = render(
			<ThemePreviewCard theme={makeTheme()} isSelected={false} onSelect={vi.fn()} />,
		);
		const card = container.querySelector('[data-testid="theme-preview-card"]');
		expect(card?.className).not.toContain('ring-2');
	});

	it('クリックで onSelect が呼ばれる', () => {
		const onSelect = vi.fn();
		render(<ThemePreviewCard theme={makeTheme()} isSelected={false} onSelect={onSelect} />);
		fireEvent.click(screen.getByTestId('theme-preview-card'));
		expect(onSelect).toHaveBeenCalledWith('theme-1');
	});

	it('isSelected=true のときチェックマークを表示する', () => {
		render(<ThemePreviewCard theme={makeTheme()} isSelected={true} onSelect={vi.fn()} />);
		expect(screen.getByTestId('check-mark')).toBeTruthy();
	});

	it('isSelected=false のときチェックマークを表示しない', () => {
		render(<ThemePreviewCard theme={makeTheme()} isSelected={false} onSelect={vi.fn()} />);
		expect(screen.queryByTestId('check-mark')).toBeNull();
	});
});
