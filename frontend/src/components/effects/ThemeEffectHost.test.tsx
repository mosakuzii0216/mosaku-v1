import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ThemeEffectHost } from './ThemeEffectHost';
import type { Theme } from '../../types/theme';

function createMockTheme(overrides: Partial<Theme> = {}): Theme {
	return {
		id: 'theme-1',
		name: 'mori',
		description: 'Forest theme',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'themes/mori/mori.css',
		metadata: { effectKey: 'mori' },
		createdAt: '2026-01-01',
		updatedAt: '2026-01-01',
		createdById: null,
		favoriteCount: 0,
		usageCount: 0,
		...overrides,
	};
}

function createThemeWithoutEffect(overrides: Partial<Theme> = {}): Theme {
	return createMockTheme({
		id: 'theme-kami',
		name: 'kami',
		metadata: undefined,
		...overrides,
	});
}

vi.mock('../../themes/themeEffectRegistry', () => {
	const MockEffect = () => {
		return <div data-testid="mock-effect">Mock Effect</div>;
	};
	MockEffect.displayName = 'MockEffect';

	return {
		resolveThemeEffect: vi.fn((key: string | undefined) => {
			if (key === 'mori') {
				return () => Promise.resolve({ default: MockEffect });
			}
			return null;
		}),
	};
});

describe('ThemeEffectHost', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('theme が null の場合', () => {
		it('何もレンダーしないこと', () => {
			const { container } = render(<ThemeEffectHost theme={null} />);
			expect(container.innerHTML).toBe('');
		});
	});

	describe('effectKey 未設定のテーマの場合', () => {
		it('何もレンダーしないこと', () => {
			const theme = createThemeWithoutEffect();
			const { container } = render(<ThemeEffectHost theme={theme} />);
			expect(container.innerHTML).toBe('');
		});
	});

	describe('effectKey が設定されたテーマの場合', () => {
		it('エフェクトコンポーネントが lazy ロードされてマウントされること', async () => {
			const theme = createMockTheme();
			const { findByTestId } = render(<ThemeEffectHost theme={theme} />);
			const effect = await findByTestId('mock-effect');
			expect(effect).toBeTruthy();
		});
	});

	describe('テーマ切替', () => {
		it('mori → kami 切替時に子エフェクトがアンマウントされること', async () => {
			const moriTheme = createMockTheme();
			const kamiTheme = createThemeWithoutEffect();

			const { findByTestId, rerender, queryByTestId } = render(
				<ThemeEffectHost theme={moriTheme} />,
			);

			await findByTestId('mock-effect');

			await act(async () => {
				rerender(<ThemeEffectHost theme={kamiTheme} />);
			});

			expect(queryByTestId('mock-effect')).toBeNull();
		});

		it('mori → null 切替時に子エフェクトがアンマウントされること', async () => {
			const moriTheme = createMockTheme();

			const { findByTestId, rerender, queryByTestId } = render(
				<ThemeEffectHost theme={moriTheme} />,
			);

			await findByTestId('mock-effect');

			await act(async () => {
				rerender(<ThemeEffectHost theme={null} />);
			});

			expect(queryByTestId('mock-effect')).toBeNull();
		});
	});

	describe('ErrorBoundary', () => {
		it('ロード失敗時に null にフォールバックすること', async () => {
			const { resolveThemeEffect } = await import('../../themes/themeEffectRegistry');
			const mockedResolve = vi.mocked(resolveThemeEffect);
			mockedResolve.mockReturnValue(() => Promise.reject(new Error('Load failed')));

			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

			const theme = createMockTheme();
			const { container } = render(<ThemeEffectHost theme={theme} />);

			await act(async () => {
				await new Promise((r) => setTimeout(r, 100));
			});

			expect(container.querySelector('[data-testid="mock-effect"]')).toBeNull();

			consoleError.mockRestore();
		});
	});
});
