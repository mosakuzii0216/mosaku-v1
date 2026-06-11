import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const mockOpen = vi.fn();

vi.mock('../../stores/useOnboardingStore', () => ({
	useOnboardingStore: (selector: (s: { open: () => void }) => unknown) =>
		selector({ open: mockOpen }),
}));

let mockUser: { onboardingCompleted: boolean } | null = null;

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({ user: mockUser }),
}));

import { OnboardingGate } from './OnboardingGate';

describe('OnboardingGate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUser = null;
	});

	it('何もレンダリングしない（return null）', () => {
		mockUser = { onboardingCompleted: false };
		const { container } = render(<OnboardingGate />);
		expect(container.firstChild).toBeNull();
	});

	it('user が null のとき open を呼ばない', () => {
		mockUser = null;
		render(<OnboardingGate />);
		expect(mockOpen).not.toHaveBeenCalled();
	});

	it('onboardingCompleted が false のとき open を呼ぶ', () => {
		mockUser = { onboardingCompleted: false };
		render(<OnboardingGate />);
		expect(mockOpen).toHaveBeenCalledOnce();
	});

	it('onboardingCompleted が true のとき open を呼ばない', () => {
		mockUser = { onboardingCompleted: true };
		render(<OnboardingGate />);
		expect(mockOpen).not.toHaveBeenCalled();
	});
});
