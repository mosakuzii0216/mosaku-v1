import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockCompleteOnboarding = vi.fn();
const mockSkipOnboarding = vi.fn();
let mockIsCompletePending = false;
let mockIsSkipPending = false;

vi.mock('../../hooks/useOnboardingQueries', () => ({
	useCompleteOnboarding: () => ({
		completeOnboarding: mockCompleteOnboarding,
		isPending: mockIsCompletePending,
	}),
	useSkipOnboarding: () => ({
		skipOnboarding: mockSkipOnboarding,
		isPending: mockIsSkipPending,
	}),
}));

let mockIsOpen = false;
let mockSelectedThemeId: string | null = null;
const mockClose = vi.fn();
const mockSetSelectedThemeId = vi.fn();
const mockOpen = vi.fn();

vi.mock('../../stores/useOnboardingStore', () => ({
	useOnboardingStore: (
		selector: (s: {
			isOpen: boolean;
			selectedThemeId: string | null;
			close: () => void;
			setSelectedThemeId: (id: string | null) => void;
			open: () => void;
		}) => unknown,
	) =>
		selector({
			isOpen: mockIsOpen,
			selectedThemeId: mockSelectedThemeId,
			close: mockClose,
			setSelectedThemeId: mockSetSelectedThemeId,
			open: mockOpen,
		}),
}));

vi.mock('./ThemeGallery', () => ({
	ThemeGallery: () => <div data-testid="theme-gallery" />,
}));

import { OnboardingModal } from './OnboardingModal';

describe('OnboardingModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsOpen = false;
		mockSelectedThemeId = null;
		mockIsCompletePending = false;
		mockIsSkipPending = false;
	});

	it('isOpen が false のとき null を返す', () => {
		mockIsOpen = false;
		const { container } = render(<OnboardingModal />);
		expect(container.firstChild).toBeNull();
	});

	it('isOpen が true のときモーダルが表示される', () => {
		mockIsOpen = true;
		render(<OnboardingModal />);
		expect(screen.getByRole('dialog')).toBeTruthy();
	});

	it('ThemeGallery を含む', () => {
		mockIsOpen = true;
		render(<OnboardingModal />);
		expect(screen.getByTestId('theme-gallery')).toBeTruthy();
	});

	it('selectedThemeId が null のとき "始める" ボタンは disabled', () => {
		mockIsOpen = true;
		mockSelectedThemeId = null;
		render(<OnboardingModal />);
		const startButton = screen.getByRole('button', { name: /始める/ });
		expect(startButton).toHaveProperty('disabled', true);
	});

	it('selectedThemeId が設定されているとき "始める" ボタンは有効', () => {
		mockIsOpen = true;
		mockSelectedThemeId = 'theme-1';
		render(<OnboardingModal />);
		const startButton = screen.getByRole('button', { name: /始める/ });
		expect(startButton).toHaveProperty('disabled', false);
	});

	it('isPending のとき "始める" ボタンは disabled', () => {
		mockIsOpen = true;
		mockSelectedThemeId = 'theme-1';
		mockIsCompletePending = true;
		render(<OnboardingModal />);
		const startButton = screen.getByRole('button', { name: /始める/ });
		expect(startButton).toHaveProperty('disabled', true);
	});

	it('"始める" クリックで completeOnboarding が selectedThemeId で呼ばれる', () => {
		mockIsOpen = true;
		mockSelectedThemeId = 'theme-abc';
		render(<OnboardingModal />);
		const startButton = screen.getByRole('button', { name: /始める/ });
		fireEvent.click(startButton);
		expect(mockCompleteOnboarding).toHaveBeenCalledWith('theme-abc');
	});

	it('isPending でないとき "あとで" リンクが表示される', () => {
		mockIsOpen = true;
		mockIsSkipPending = false;
		render(<OnboardingModal />);
		expect(screen.getByTestId('skip-link')).toBeTruthy();
	});

	it('isPending のとき "あとで" リンクは非表示', () => {
		mockIsOpen = true;
		mockIsSkipPending = true;
		render(<OnboardingModal />);
		expect(screen.queryByTestId('skip-link')).toBeNull();
	});

	it('"あとで" クリックで skipOnboarding が呼ばれる', () => {
		mockIsOpen = true;
		render(<OnboardingModal />);
		const skipLink = screen.getByTestId('skip-link');
		fireEvent.click(skipLink);
		expect(mockSkipOnboarding).toHaveBeenCalled();
	});

	it('固定位置の全画面オーバーレイクラスを持つ', () => {
		mockIsOpen = true;
		render(<OnboardingModal />);
		const backdrop = screen.getByTestId('onboarding-backdrop');
		expect(backdrop.className).toContain('fixed');
		expect(backdrop.className).toContain('inset-0');
		expect(backdrop.className).toContain('z-50');
	});
});
