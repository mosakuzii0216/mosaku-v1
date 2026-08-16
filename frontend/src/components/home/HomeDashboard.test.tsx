import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('./NewMemoHero', () => ({
	NewMemoHero: () => <div data-testid="new-memo-hero">NewMemoHero</div>,
}));

vi.mock('./RecentMemosSection', () => ({
	RecentMemosSection: () => <div data-testid="recent-memos-section">RecentMemosSection</div>,
}));

vi.mock('./WeeklyActivitySummary', () => ({
	WeeklyActivitySummary: () => (
		<div data-testid="weekly-activity-summary">WeeklyActivitySummary</div>
	),
}));

vi.mock('./ActivityCalendar', () => ({
	ActivityCalendar: () => <div data-testid="activity-calendar">ActivityCalendar</div>,
}));

vi.mock('./HomeNotebookSection', () => ({
	HomeNotebookSection: () => <div data-testid="home-notebook-section">HomeNotebookSection</div>,
}));

vi.mock('./DailyPrompt', () => ({
	DailyPrompt: vi.fn(() => <div data-testid="daily-prompt">DailyPrompt</div>),
}));

import { DailyPrompt } from './DailyPrompt';
import { HomeDashboard } from './HomeDashboard';

describe('HomeDashboard', () => {
	it('data-testid="home-dashboard" を持つ要素をレンダリングする', () => {
		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('home-dashboard')).toBeTruthy();
	});

	it('スクロール可能な縦積みレイアウトクラスを持つ', () => {
		const { getByTestId } = render(<HomeDashboard />);
		const container = getByTestId('home-dashboard');
		expect(container.classList.contains('overflow-y-auto')).toBe(true);
	});

	it('NewMemoHero をレンダリングする', () => {
		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('new-memo-hero')).toBeTruthy();
	});

	it('RecentMemosSection をレンダリングする', () => {
		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('recent-memos-section')).toBeTruthy();
	});

	it('WeeklyActivitySummary をレンダリングする', () => {
		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('weekly-activity-summary')).toBeTruthy();
	});

	it('ActivityCalendar をレンダリングする', () => {
		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('activity-calendar')).toBeTruthy();
	});

	it('HomeNotebookSection をレンダリングする', () => {
		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('home-notebook-section')).toBeTruthy();
	});

	it('DailyPrompt をレンダリングする', () => {
		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('daily-prompt')).toBeTruthy();
	});

	it('セクションが正しい縦積み順序で並ぶ', () => {
		const { getByTestId } = render(<HomeDashboard />);
		const container = getByTestId('home-dashboard');
		const testIds = Array.from(container.children).map(
			(child) => (child as HTMLElement).dataset.testid,
		);
		expect(testIds).toEqual([
			'new-memo-hero',
			'recent-memos-section',
			'weekly-activity-summary',
			'activity-calendar',
			'home-notebook-section',
			'daily-prompt',
		]);
	});

	it('DailyPrompt が null を返してもその他セクションは表示される', () => {
		vi.mocked(DailyPrompt).mockImplementationOnce(() => null);

		const { getByTestId } = render(<HomeDashboard />);
		expect(getByTestId('new-memo-hero')).toBeTruthy();
		expect(getByTestId('recent-memos-section')).toBeTruthy();
		expect(getByTestId('weekly-activity-summary')).toBeTruthy();
		expect(getByTestId('activity-calendar')).toBeTruthy();
		expect(getByTestId('home-notebook-section')).toBeTruthy();
		expect(getByTestId('home-dashboard')).toBeTruthy();
	});
});
