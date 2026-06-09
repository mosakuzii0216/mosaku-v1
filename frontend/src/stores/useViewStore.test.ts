import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './useViewStore';

describe('useViewStore - 表示モード', () => {
	beforeEach(() => {
		useViewStore.setState({ isDisplayMode: false });
	});

	it('初期状態は isDisplayMode: false', () => {
		expect(useViewStore.getState().isDisplayMode).toBe(false);
	});

	it('openDisplayMode() で isDisplayMode が true になる', () => {
		useViewStore.getState().openDisplayMode();
		expect(useViewStore.getState().isDisplayMode).toBe(true);
	});

	it('closeDisplayMode() で isDisplayMode が false になる', () => {
		useViewStore.setState({ isDisplayMode: true });
		useViewStore.getState().closeDisplayMode();
		expect(useViewStore.getState().isDisplayMode).toBe(false);
	});

	it('openDisplayMode() → closeDisplayMode() でトグル動作する', () => {
		useViewStore.getState().openDisplayMode();
		expect(useViewStore.getState().isDisplayMode).toBe(true);

		useViewStore.getState().closeDisplayMode();
		expect(useViewStore.getState().isDisplayMode).toBe(false);
	});
});
