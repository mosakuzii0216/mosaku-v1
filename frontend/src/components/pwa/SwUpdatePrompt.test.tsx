import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useSwRegistration', () => ({
	useSwRegistration: vi.fn(),
}));

import { useSwRegistration } from '../../hooks/useSwRegistration';
import { SwUpdatePrompt } from './SwUpdatePrompt';

const useSwRegistrationMock = vi.mocked(useSwRegistration);

function setupHook(overrides: Partial<ReturnType<typeof useSwRegistration>> = {}) {
	const update = overrides.update ?? vi.fn(async () => {});
	const dismiss = overrides.dismiss ?? vi.fn();
	useSwRegistrationMock.mockReturnValue({
		needRefresh: overrides.needRefresh ?? false,
		offlineReady: overrides.offlineReady ?? false,
		update,
		dismiss,
	});
	return { update, dismiss };
}

describe('SwUpdatePrompt', () => {
	beforeEach(() => {
		useSwRegistrationMock.mockReset();
	});

	it('renders nothing while needRefresh is false', () => {
		setupHook({ needRefresh: false });
		const { container } = render(<SwUpdatePrompt />);
		expect(container.firstChild).toBeNull();
	});

	it('renders an accessible status banner with both choices when needRefresh is true', () => {
		setupHook({ needRefresh: true });
		render(<SwUpdatePrompt />);

		const region = screen.getByRole('status');
		expect(region).toBeTruthy();
		expect(region.getAttribute('aria-live')).toBe('polite');
		expect(screen.getByRole('button', { name: '更新する' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'あとで' })).toBeTruthy();
	});

	it('invokes update() when the user clicks the "更新する" button', () => {
		const { update } = setupHook({ needRefresh: true });
		render(<SwUpdatePrompt />);

		fireEvent.click(screen.getByRole('button', { name: '更新する' }));
		expect(update).toHaveBeenCalledTimes(1);
	});

	it('invokes dismiss() when the user clicks the "あとで" button', () => {
		const { dismiss } = setupHook({ needRefresh: true });
		render(<SwUpdatePrompt />);

		fireEvent.click(screen.getByRole('button', { name: 'あとで' }));
		expect(dismiss).toHaveBeenCalledTimes(1);
	});
});
