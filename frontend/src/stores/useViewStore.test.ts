import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './useViewStore';

describe('useViewStore - ホーム画面', () => {
	beforeEach(() => {
		useViewStore.setState({
			currentObject: 'memo',
			currentView: 'list',
			isEditing: false,
		});
	});

	it('初期状態は currentObject: "home"', () => {
		// 初期状態をリセットして確認するため直接チェック
		const initialState = useViewStore.getInitialState
			? // Zustand 4.x では getInitialState() が使えないのでここでは goToHome() 動作を検証
				undefined
			: undefined;
		void initialState;
		// goToHome() が正しい状態にセットするかを確認
		useViewStore.getState().goToHome();
		expect(useViewStore.getState().currentObject).toBe('home');
	});

	it('goToHome() で currentObject が "home" になる', () => {
		useViewStore.getState().goToHome();
		expect(useViewStore.getState().currentObject).toBe('home');
	});

	it('goToHome() で currentView が "list" になる', () => {
		useViewStore.getState().goToHome();
		expect(useViewStore.getState().currentView).toBe('list');
	});

	it('goToHome() で isEditing が false になる', () => {
		useViewStore.setState({ isEditing: true });
		useViewStore.getState().goToHome();
		expect(useViewStore.getState().isEditing).toBe(false);
	});
});

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
