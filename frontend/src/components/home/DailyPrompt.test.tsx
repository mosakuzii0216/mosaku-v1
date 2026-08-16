import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const mockGoToMemoCreateWithTitle = vi.fn();

vi.mock('../../hooks/useNavigation', () => ({
	useNavigation: vi.fn(() => ({
		goToMemoCreateWithTitle: mockGoToMemoCreateWithTitle,
	})),
}));

vi.mock('../../constants/dailyPrompts', () => ({
	getDailyPrompt: vi.fn(),
}));

import { getDailyPrompt } from '../../constants/dailyPrompts';
import { DailyPrompt } from './DailyPrompt';

describe('DailyPrompt', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('お題テキストを表示する', () => {
		vi.mocked(getDailyPrompt).mockReturnValue('今日一番印象に残ったことは？');

		const { getByText } = render(<DailyPrompt />);
		expect(getByText('今日一番印象に残ったことは？')).toBeTruthy();
	});

	it('クリックで goToMemoCreateWithTitle をお題テキストで呼び出す', () => {
		vi.mocked(getDailyPrompt).mockReturnValue('今日一番印象に残ったことは？');

		const { getByText } = render(<DailyPrompt />);
		fireEvent.click(getByText('今日一番印象に残ったことは？'));
		expect(mockGoToMemoCreateWithTitle).toHaveBeenCalledWith('今日一番印象に残ったことは？');
	});

	it('getDailyPrompt が undefined を返す場合は null を返す（非表示）', () => {
		vi.mocked(getDailyPrompt).mockReturnValue(undefined);

		const { container } = render(<DailyPrompt />);
		expect(container.firstChild).toBeNull();
	});
});
