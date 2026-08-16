import { describe, it, expect, beforeEach } from 'vitest';
import { useFeedbackStore } from './useFeedbackStore';

describe('useFeedbackStore', () => {
	beforeEach(() => {
		useFeedbackStore.setState({ isOpen: false });
	});

	it('初期状態は isOpen: false', () => {
		expect(useFeedbackStore.getState().isOpen).toBe(false);
	});

	it('open() で isOpen が true になる', () => {
		useFeedbackStore.getState().open();
		expect(useFeedbackStore.getState().isOpen).toBe(true);
	});

	it('close() で isOpen が false になる', () => {
		useFeedbackStore.setState({ isOpen: true });
		useFeedbackStore.getState().close();
		expect(useFeedbackStore.getState().isOpen).toBe(false);
	});

	it('open() → close() でトグル動作する', () => {
		useFeedbackStore.getState().open();
		expect(useFeedbackStore.getState().isOpen).toBe(true);

		useFeedbackStore.getState().close();
		expect(useFeedbackStore.getState().isOpen).toBe(false);
	});
});
