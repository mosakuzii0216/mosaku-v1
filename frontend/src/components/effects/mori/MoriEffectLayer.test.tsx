import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

type ChangeHandler = (event: { matches: boolean }) => void;

function createMatchMediaMock(matches: boolean) {
	let changeHandler: ChangeHandler | null = null;
	return {
		matches,
		addEventListener: vi.fn((_event: string, handler: ChangeHandler) => {
			changeHandler = handler;
		}),
		removeEventListener: vi.fn(),
		dispatchChange: (newMatches: boolean) => {
			changeHandler?.({ matches: newMatches });
		},
	};
}

function setupMatchMedia(options: { reducedMotion?: boolean; pointerCoarse?: boolean } = {}) {
	const reducedMotionMql = createMatchMediaMock(options.reducedMotion ?? false);
	const pointerCoarseMql = createMatchMediaMock(options.pointerCoarse ?? false);

	vi.stubGlobal(
		'matchMedia',
		vi.fn().mockImplementation((query: string) => {
			if (query === '(prefers-reduced-motion: reduce)') return reducedMotionMql;
			if (query === '(pointer: coarse)') return pointerCoarseMql;
			return createMatchMediaMock(false);
		}),
	);

	return { reducedMotionMql, pointerCoarseMql };
}

vi.mock('../../../hooks/useMoriEffectControl', () => ({
	useMoriEffectControl: vi.fn(),
}));

import { useMoriEffectControl } from '../../../hooks/useMoriEffectControl';
import { useEditorFocusStore } from '../../../stores/useEditorFocusStore';

const mockUseMoriEffectControl = vi.mocked(useMoriEffectControl);

describe('MoriEffectLayer', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		setupMatchMedia();
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
		vi.stubGlobal('cancelAnimationFrame', vi.fn());

		mockUseMoriEffectControl.mockReturnValue({
			shouldRun: true,
			isReducedMotion: false,
			isEditorFocused: false,
			isHidden: false,
			isIdle: false,
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		useEditorFocusStore.setState({ isEditorFocused: false });
	});

	async function renderMoriEffectLayer() {
		vi.resetModules();
		const { default: MoriEffectLayer } = await import('./MoriEffectLayer');
		return render(<MoriEffectLayer />);
	}

	describe('レンダリング', () => {
		it('ルート要素が fixed inset-0 pointer-events-none であること', async () => {
			const { container } = await renderMoriEffectLayer();
			const root = container.firstChild as HTMLElement;
			expect(root).toBeTruthy();
			expect(root.style.position).toBe('fixed');
			expect(root.style.inset).toBe('0px');
			expect(root.style.pointerEvents).toBe('none');
		});

		it('ForestAnimationLayer がマウントされること', async () => {
			const { container } = await renderMoriEffectLayer();
			const forestLayer = container.querySelector('.forest-animation');
			expect(forestLayer).toBeTruthy();
		});

		it('pointer: fine デバイスで ParticleCanvas がマウントされること', async () => {
			const { container } = await renderMoriEffectLayer();
			const canvas = container.querySelector('canvas');
			expect(canvas).toBeTruthy();
		});
	});

	describe('pointer: coarse デバイスでの ParticleCanvas 非マウント', () => {
		it('pointer: coarse のとき ParticleCanvas がマウントされないこと', async () => {
			setupMatchMedia({ pointerCoarse: true });
			const { container } = await renderMoriEffectLayer();
			const canvas = container.querySelector('canvas');
			expect(canvas).toBeNull();
		});

		it('pointer: coarse でも ForestAnimationLayer はマウントされること', async () => {
			setupMatchMedia({ pointerCoarse: true });
			const { container } = await renderMoriEffectLayer();
			const forestLayer = container.querySelector('.forest-animation');
			expect(forestLayer).toBeTruthy();
		});
	});

	describe('shouldRun と paused の連携', () => {
		it('shouldRun=true のとき paused=false が ForestAnimationLayer に渡ること', async () => {
			mockUseMoriEffectControl.mockReturnValue({
				shouldRun: true,
				isReducedMotion: false,
				isEditorFocused: false,
				isHidden: false,
				isIdle: false,
			});
			const { container } = await renderMoriEffectLayer();
			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationPlayState).toBe('running');
		});

		it('shouldRun=false のとき paused=true が ForestAnimationLayer に渡ること', async () => {
			mockUseMoriEffectControl.mockReturnValue({
				shouldRun: false,
				isReducedMotion: false,
				isEditorFocused: true,
				isHidden: false,
				isIdle: false,
			});
			const { container } = await renderMoriEffectLayer();
			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationPlayState).toBe('paused');
		});
	});

	describe('フォーカス状態ストアとの統合', () => {
		it('エディタフォーカス時に paused が伝播すること', async () => {
			mockUseMoriEffectControl.mockReturnValue({
				shouldRun: false,
				isReducedMotion: false,
				isEditorFocused: true,
				isHidden: false,
				isIdle: false,
			});

			const { container } = await renderMoriEffectLayer();

			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationPlayState).toBe('paused');

			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			fogElements.forEach((el) => {
				expect((el as HTMLElement).style.animationPlayState).toBe('paused');
			});
		});
	});

	describe('アンマウント時のクリーンアップ', () => {
		it('アンマウント時に cancelAnimationFrame が呼ばれること', async () => {
			const cancelSpy = vi.fn();
			vi.stubGlobal('cancelAnimationFrame', cancelSpy);
			vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(42));

			const { unmount } = await renderMoriEffectLayer();
			unmount();

			expect(cancelSpy).toHaveBeenCalled();
		});

		it('アンマウント時にイベントリスナーが解除されること', async () => {
			const removeSpy = vi.spyOn(window, 'removeEventListener');
			const { unmount } = await renderMoriEffectLayer();
			unmount();

			const mousemoveCleanups = removeSpy.mock.calls.filter(([event]) => event === 'mousemove');
			expect(mousemoveCleanups.length).toBeGreaterThan(0);
		});
	});
});
