import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ThemeEffectHost } from '../ThemeEffectHost';

type ChangeHandler = (event: { matches: boolean }) => void;

// MoriEffectLayer は動的 import（lazy）で読み込まれるため、full-suite 実行時の負荷で
// デフォルト 1 秒のタイムアウトに間に合わず flaky になる。待機時間を延長して安定させる。
const LAZY_LAYER_TIMEOUT = 5000;

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

function createMoriTheme() {
	return {
		id: 'theme-mori',
		name: 'mori',
		metadata: { effectKey: 'mori' as const },
	};
}

function createKamiTheme() {
	return {
		id: 'theme-kami',
		name: 'kami',
		metadata: undefined,
	};
}

describe('14.2: テーマ切替のライフサイクル整合性テスト', () => {
	let cancelSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.restoreAllMocks();
		setupMatchMedia();
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(42));
		cancelSpy = vi.fn();
		vi.stubGlobal('cancelAnimationFrame', cancelSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('mori → 非 mori 切替で Canvas と森要素が DOM から除去されること', async () => {
		const moriTheme = createMoriTheme();
		const kamiTheme = createKamiTheme();

		const { findByTestId, rerender, container } = render(<ThemeEffectHost theme={moriTheme} />);

		await findByTestId('mori-effect-layer', {}, { timeout: LAZY_LAYER_TIMEOUT });

		const canvasBefore = container.querySelector('canvas');
		const forestBefore = container.querySelector('.forest-animation');
		expect(canvasBefore).toBeTruthy();
		expect(forestBefore).toBeTruthy();

		await act(async () => {
			rerender(<ThemeEffectHost theme={kamiTheme} />);
		});

		const canvasAfter = container.querySelector('canvas');
		const forestAfter = container.querySelector('.forest-animation');
		expect(canvasAfter).toBeNull();
		expect(forestAfter).toBeNull();
	});

	it('mori → 非 mori 切替で cancelAnimationFrame が呼ばれること', async () => {
		const moriTheme = createMoriTheme();
		const kamiTheme = createKamiTheme();

		const { findByTestId, rerender } = render(<ThemeEffectHost theme={moriTheme} />);

		await findByTestId('mori-effect-layer', {}, { timeout: LAZY_LAYER_TIMEOUT });

		await act(async () => {
			rerender(<ThemeEffectHost theme={kamiTheme} />);
		});

		expect(cancelSpy).toHaveBeenCalled();
	});

	it('テーマ切替連打で DOM にエフェクト要素が残存しないこと', async () => {
		const moriTheme = createMoriTheme();
		const kamiTheme = createKamiTheme();

		const { findByTestId, rerender, container } = render(<ThemeEffectHost theme={moriTheme} />);

		await findByTestId('mori-effect-layer', {}, { timeout: LAZY_LAYER_TIMEOUT });

		for (let i = 0; i < 5; i++) {
			await act(async () => {
				rerender(<ThemeEffectHost theme={kamiTheme} />);
			});
			await act(async () => {
				rerender(<ThemeEffectHost theme={moriTheme} />);
			});
			await act(async () => {
				await new Promise((r) => setTimeout(r, 10));
			});
		}

		await act(async () => {
			rerender(<ThemeEffectHost theme={kamiTheme} />);
		});

		expect(container.querySelector('canvas')).toBeNull();
		expect(container.querySelector('.forest-animation')).toBeNull();
	});
});

describe('14.3: アクセシビリティ — prefers-reduced-motion 回帰テスト', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reduced-motion 有効時に CSS アニメーションが停止し背景パレットが維持されること', async () => {
		setupMatchMedia({ reducedMotion: true });

		const moriTheme = createMoriTheme();
		const { findByTestId, container } = render(<ThemeEffectHost theme={moriTheme} />);

		await findByTestId('mori-effect-layer', {}, { timeout: LAZY_LAYER_TIMEOUT });

		const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
		expect(waveElement).toBeTruthy();
		expect(waveElement.style.animationName).toBe('none');
		expect(waveElement.getAttribute('data-disabled')).toBe('true');

		expect(waveElement.style.background).toContain('linear-gradient');

		const fogElements = container.querySelectorAll('[data-animation="fog"]');
		fogElements.forEach((el) => {
			expect((el as HTMLElement).style.animationName).toBe('none');
		});

		const leafElements = container.querySelectorAll('[data-animation="leaf"]');
		leafElements.forEach((el) => {
			expect((el as HTMLElement).style.animationName).toBe('none');
		});
	});

	it('reduced-motion 有効時に ParticleCanvas が非表示になること', async () => {
		setupMatchMedia({ reducedMotion: true });

		const moriTheme = createMoriTheme();
		const { findByTestId, container } = render(<ThemeEffectHost theme={moriTheme} />);

		await findByTestId('mori-effect-layer', {}, { timeout: LAZY_LAYER_TIMEOUT });

		const canvas = container.querySelector('canvas');
		if (canvas) {
			const isHidden =
				canvas.className.includes('hidden') || canvas.getAttribute('data-hidden') === 'true';
			expect(isHidden).toBe(true);
		}
	});
});
