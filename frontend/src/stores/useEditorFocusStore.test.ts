import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorFocusStore } from './useEditorFocusStore';

describe('useEditorFocusStore', () => {
	beforeEach(() => {
		useEditorFocusStore.setState({ isEditorFocused: false });
	});

	it('初期値は false', () => {
		const { isEditorFocused } = useEditorFocusStore.getState();
		expect(isEditorFocused).toBe(false);
	});

	it('setEditorFocused(true) でフラグが true に切り替わる', () => {
		useEditorFocusStore.getState().setEditorFocused(true);
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(true);
	});

	it('setEditorFocused(false) でフラグが false に戻る', () => {
		useEditorFocusStore.getState().setEditorFocused(true);
		useEditorFocusStore.getState().setEditorFocused(false);
		expect(useEditorFocusStore.getState().isEditorFocused).toBe(false);
	});
});
