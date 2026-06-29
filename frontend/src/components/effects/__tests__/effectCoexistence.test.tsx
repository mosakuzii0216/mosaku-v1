import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { ThemeEffectHost } from '../ThemeEffectHost';
import MoriEffectLayer from '../mori/MoriEffectLayer';
import { useEditorFocusStore } from '../../../stores/useEditorFocusStore';

/*
 * effectCoexistence.test.tsx — Task 6「エフェクト共存（生きた背景の単一ソース化）」
 * ============================================================================
 * Requirements: 5.1（森資産の再利用）/ 5.3（既存の4条件自動停止との共存）/ 7.4（認証・編集への非干渉）
 *
 * Task 6 で mori.css の .theme-root から生きた背景（wave-pulse グラデ・fog-drift 霧）を撤去し、
 * 生きた背景の真実の源泉を MoriEffectLayer（position:fixed z-0 ＋ useMoriEffectControl の
 * 4条件自動停止つき）へ一本化した（G-4 二重背景解消）。本テストは
 *   (1) 森適用でエフェクトがマウントされ「単一の fixed 背景ソース」になること
 *   (2) reduced-motion／エディタフォーカス／タブ非表示／マウスアイドルの4条件停止が
 *       生きた背景へ伝播すること
 * を統合レベルで固定する。MoriEffectLayer / ForestAnimationLayer / ParticleCanvas /
 * useMoriEffectControl は無改変（5.3）。
 *
 * 二重背景解消の CSS 契約（mori で --app-shell-bg: transparent／.theme-root が生きた背景を
 * 描かない）は appShell.test.ts と mori.css.test.ts が担保する。本テストは DOM/挙動側を担保する。
 */

const LAZY_LAYER_TIMEOUT = 5000;

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
}

function createMoriTheme() {
	return { id: 'theme-mori', name: 'mori', metadata: { effectKey: 'mori' as const } };
}

function createKamiTheme() {
	return { id: 'theme-kami', name: 'kami', metadata: undefined };
}

/** ForestAnimationLayer の深緑グラデ層（wave）の再生状態を読む（4条件停止の観測点）。 */
function getWavePlayState(container: HTMLElement): string {
	const wave = container.querySelector('[data-animation="wave"]') as HTMLElement;
	return wave.style.animationPlayState;
}

describe('Task 6: エフェクト共存 — 生きた背景の単一ソース化（5.1 / 5.3 / 7.4）', () => {
	describe('森適用時のマウントと単一ソース性（ThemeEffectHost 経由）', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
			setupMatchMedia();
			vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
			vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
			vi.stubGlobal('cancelAnimationFrame', vi.fn());
		});

		afterEach(() => {
			cleanup(); // React アンマウントを matchMedia スタブ有効な間に完了させる
			vi.unstubAllGlobals();
		});

		it('mori 適用で生きた背景（ForestAnimationLayer グラデ＋ParticleCanvas）が単一の fixed レイヤーにマウントされる（5.1）', async () => {
			const { findByTestId, container } = render(<ThemeEffectHost theme={createMoriTheme()} />);
			const layer = await findByTestId('mori-effect-layer', {}, { timeout: LAZY_LAYER_TIMEOUT });

			expect(container.querySelector('.forest-animation'), '森の背景グラデ層が無い').toBeTruthy();
			expect(
				container.querySelector('[data-animation="wave"]'),
				'深緑グラデ（wave）が無い',
			).toBeTruthy();
			expect(container.querySelector('canvas'), 'パーティクル canvas が無い').toBeTruthy();

			// 生きた背景は MoriEffectLayer 唯一の fixed z-0 レイヤー（玄関側は透かすだけ＝二重背景なし / G-4）
			expect(layer.style.position).toBe('fixed');
			expect(layer.style.zIndex).toBe('0');
		});

		it('生きた背景レイヤーは操作を妨げない（pointer-events: none / 7.4 認証・編集への非干渉）', async () => {
			const { findByTestId } = render(<ThemeEffectHost theme={createMoriTheme()} />);
			const layer = await findByTestId('mori-effect-layer', {}, { timeout: LAZY_LAYER_TIMEOUT });
			expect(layer.style.pointerEvents).toBe('none');
		});

		it('非 mori テーマでは生きた背景をマウントしない（単一ソースは森のみ / 7.5 の意図）', () => {
			const { container } = render(<ThemeEffectHost theme={createKamiTheme()} />);
			expect(container.querySelector('.forest-animation')).toBeNull();
			expect(container.querySelector('canvas')).toBeNull();
		});
	});

	describe('4 条件自動停止が生きた背景へ伝播する（MoriEffectLayer 直接 / 5.3）', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
			vi.useFakeTimers();
			useEditorFocusStore.setState({ isEditorFocused: false });
			setupMatchMedia();
			vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
			vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
			vi.stubGlobal('cancelAnimationFrame', vi.fn());
			Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
		});

		afterEach(() => {
			cleanup(); // React アンマウントを matchMedia スタブ有効な間に完了させる
			vi.useRealTimers();
			vi.unstubAllGlobals();
			useEditorFocusStore.setState({ isEditorFocused: false });
		});

		it('全条件 false では生きた背景が再生される（running）', () => {
			const { container } = render(<MoriEffectLayer />);
			expect(getWavePlayState(container)).toBe('running');
		});

		it('① reduced-motion で生きた背景アニメが無効化される（animationName: none）', () => {
			setupMatchMedia({ reducedMotion: true });
			const { container } = render(<MoriEffectLayer />);
			const wave = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(wave.style.animationName).toBe('none');
		});

		it('② エディタフォーカスで生きた背景が停止する（paused）', () => {
			const { container } = render(<MoriEffectLayer />);
			expect(getWavePlayState(container)).toBe('running');
			act(() => {
				useEditorFocusStore.getState().setEditorFocused(true);
			});
			expect(getWavePlayState(container)).toBe('paused');
		});

		it('③ タブ非表示で生きた背景が停止する（paused）', () => {
			const { container } = render(<MoriEffectLayer />);
			act(() => {
				Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
				document.dispatchEvent(new Event('visibilitychange'));
			});
			expect(getWavePlayState(container)).toBe('paused');
		});

		it('④ マウスアイドル（3秒）で生きた背景が停止する（paused）', () => {
			const { container } = render(<MoriEffectLayer />);
			expect(getWavePlayState(container)).toBe('running');
			act(() => {
				vi.advanceTimersByTime(3000);
			});
			expect(getWavePlayState(container)).toBe('paused');
		});

		it('停止条件の解除で生きた背景が再生に復帰する（タブ復帰）', () => {
			const { container } = render(<MoriEffectLayer />);
			act(() => {
				Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
				document.dispatchEvent(new Event('visibilitychange'));
			});
			expect(getWavePlayState(container)).toBe('paused');
			act(() => {
				Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
				document.dispatchEvent(new Event('visibilitychange'));
			});
			expect(getWavePlayState(container)).toBe('running');
		});
	});
});
