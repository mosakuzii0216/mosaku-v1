import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore } from './useOnboardingStore';

describe('useOnboardingStore', () => {
	beforeEach(() => {
		useOnboardingStore.setState({ isOpen: false, selectedThemeId: null });
	});

	it('初期状態は isOpen: false', () => {
		expect(useOnboardingStore.getState().isOpen).toBe(false);
	});

	it('初期状態は selectedThemeId: null', () => {
		expect(useOnboardingStore.getState().selectedThemeId).toBeNull();
	});

	it('open() で isOpen が true になる', () => {
		useOnboardingStore.getState().open();
		expect(useOnboardingStore.getState().isOpen).toBe(true);
	});

	it('close() で isOpen が false になる', () => {
		useOnboardingStore.setState({ isOpen: true });
		useOnboardingStore.getState().close();
		expect(useOnboardingStore.getState().isOpen).toBe(false);
	});

	it('close() で selectedThemeId が null にリセットされる', () => {
		useOnboardingStore.setState({ isOpen: true, selectedThemeId: 'theme-123' });
		useOnboardingStore.getState().close();
		expect(useOnboardingStore.getState().selectedThemeId).toBeNull();
	});

	it('setSelectedThemeId() でテーマ ID が設定される', () => {
		useOnboardingStore.getState().setSelectedThemeId('theme-abc');
		expect(useOnboardingStore.getState().selectedThemeId).toBe('theme-abc');
	});

	it('setSelectedThemeId(null) で未選択状態に戻る', () => {
		useOnboardingStore.setState({ selectedThemeId: 'theme-abc' });
		useOnboardingStore.getState().setSelectedThemeId(null);
		expect(useOnboardingStore.getState().selectedThemeId).toBeNull();
	});

	it('open() → close() でトグル動作する', () => {
		useOnboardingStore.getState().open();
		expect(useOnboardingStore.getState().isOpen).toBe(true);

		useOnboardingStore.getState().close();
		expect(useOnboardingStore.getState().isOpen).toBe(false);
	});
});
