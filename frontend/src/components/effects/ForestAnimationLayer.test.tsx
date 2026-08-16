import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ForestAnimationLayer } from './ForestAnimationLayer';

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

describe('ForestAnimationLayer', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		const mql = createMatchMediaMock(false);
		vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
	});

	describe('レンダリング', () => {
		it('コンポーネントがレンダリングされること', () => {
			const { container } = render(<ForestAnimationLayer />);
			expect(container.firstChild).toBeTruthy();
		});

		it('position: absolute かつ inset: 0 のラッパーが存在すること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/absolute/);
			expect(wrapper.className).toMatch(/inset-0/);
		});

		it('pointer-events-none が適用されること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/pointer-events-none/);
		});

		it('aria-hidden="true" が設定されること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.getAttribute('aria-hidden')).toBe('true');
		});
	});

	describe('霧（fog-drift）アニメーション', () => {
		it('霧アニメーション要素が存在すること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			expect(fogElements.length).toBeGreaterThan(0);
		});

		it('霧要素に fog-drift アニメーションクラスが適用されること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			const hasFogAnimation = Array.from(fogElements).some(
				(el) =>
					el.className.includes('animate-fog-drift') ||
					el.getAttribute('style')?.includes('fog-drift'),
			);
			expect(hasFogAnimation).toBe(true);
		});

		it('霧要素に pointer-events-none が適用されること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			fogElements.forEach((el) => {
				expect(el.className).toMatch(/pointer-events-none/);
			});
		});
	});

	describe('disableAnimations prop', () => {
		it('disableAnimations=true のとき霧要素のアニメーションが無効化されること', () => {
			const { container } = render(<ForestAnimationLayer disableAnimations />);
			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			fogElements.forEach((el) => {
				const style = (el as HTMLElement).style.animationName;
				const hasAnimationDisabled =
					style === 'none' ||
					el.className.includes('animation-none') ||
					el.getAttribute('data-disabled') === 'true';
				expect(hasAnimationDisabled).toBe(true);
			});
		});
	});

	describe('prefers-reduced-motion 対応', () => {
		it('reduced-motion が true のとき霧アニメーションが停止されること', () => {
			const mql = createMatchMediaMock(true);
			vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

			const { container } = render(<ForestAnimationLayer />);
			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			fogElements.forEach((el) => {
				const style = (el as HTMLElement).style.animationName;
				const hasAnimationDisabled =
					style === 'none' ||
					el.className.includes('animation-none') ||
					el.getAttribute('data-disabled') === 'true';
				expect(hasAnimationDisabled).toBe(true);
			});
		});
	});

	describe('葉の漂い（leaf-float）アニメーション', () => {
		it('葉アニメーション要素が 2〜4 個存在すること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const leafElements = container.querySelectorAll('[data-animation="leaf"]');
			expect(leafElements.length).toBeGreaterThanOrEqual(2);
			expect(leafElements.length).toBeLessThanOrEqual(4);
		});

		it('葉要素に leaf-float アニメーションが適用されること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const leafElements = container.querySelectorAll('[data-animation="leaf"]');
			const hasLeafAnimation = Array.from(leafElements).some(
				(el) =>
					el.className.includes('animate-leaf-float') ||
					(el as HTMLElement).style.animationName?.includes('leaf-float'),
			);
			expect(hasLeafAnimation).toBe(true);
		});

		it('葉要素に pointer-events-none が適用されること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const leafElements = container.querySelectorAll('[data-animation="leaf"]');
			leafElements.forEach((el) => {
				expect(el.className).toMatch(/pointer-events-none/);
			});
		});

		it('disableAnimations=true のとき葉要素のアニメーションが無効化されること', () => {
			const { container } = render(<ForestAnimationLayer disableAnimations />);
			const leafElements = container.querySelectorAll('[data-animation="leaf"]');
			leafElements.forEach((el) => {
				const style = (el as HTMLElement).style.animationName;
				const hasAnimationDisabled =
					style === 'none' ||
					el.className.includes('animation-none') ||
					el.getAttribute('data-disabled') === 'true';
				expect(hasAnimationDisabled).toBe(true);
			});
		});

		it('reduced-motion が true のとき葉アニメーションが停止されること', () => {
			const mql = createMatchMediaMock(true);
			vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

			const { container } = render(<ForestAnimationLayer />);
			const leafElements = container.querySelectorAll('[data-animation="leaf"]');
			leafElements.forEach((el) => {
				const style = (el as HTMLElement).style.animationName;
				const hasAnimationDisabled =
					style === 'none' ||
					el.className.includes('animation-none') ||
					el.getAttribute('data-disabled') === 'true';
				expect(hasAnimationDisabled).toBe(true);
			});
		});
	});

	describe('波打ち（wave-pulse）アニメーション', () => {
		it('波アニメーション要素が存在すること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const waveElement = container.querySelector('[data-animation="wave"]');
			expect(waveElement).toBeTruthy();
		});

		it('波要素に wave-pulse アニメーションが適用されること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationName).toBe('wave-pulse');
		});

		it('波要素のアニメーション周期が 12s であること', () => {
			const { container } = render(<ForestAnimationLayer />);
			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationDuration).toBe('12s');
		});

		it('disableAnimations=true のとき波アニメーションが無効化されること', () => {
			const { container } = render(<ForestAnimationLayer disableAnimations />);
			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			const hasAnimationDisabled =
				waveElement.style.animationName === 'none' ||
				waveElement.getAttribute('data-disabled') === 'true';
			expect(hasAnimationDisabled).toBe(true);
		});
	});

	describe('paused prop', () => {
		it('paused=true のとき全アニメーション要素の animationPlayState が paused になること', () => {
			const { container } = render(<ForestAnimationLayer paused />);

			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationPlayState).toBe('paused');

			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			fogElements.forEach((el) => {
				expect((el as HTMLElement).style.animationPlayState).toBe('paused');
			});

			const leafElements = container.querySelectorAll('[data-animation="leaf"]');
			leafElements.forEach((el) => {
				expect((el as HTMLElement).style.animationPlayState).toBe('paused');
			});
		});

		it('paused=false のとき animationPlayState が running であること', () => {
			const { container } = render(<ForestAnimationLayer paused={false} />);

			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationPlayState).toBe('running');

			const fogElements = container.querySelectorAll('[data-animation="fog"]');
			fogElements.forEach((el) => {
				expect((el as HTMLElement).style.animationPlayState).toBe('running');
			});
		});

		it('paused 未指定のとき animationPlayState が running であること', () => {
			const { container } = render(<ForestAnimationLayer />);

			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationPlayState).toBe('running');
		});

		it('paused=true でも disableAnimations は animationName=none を優先すること', () => {
			const { container } = render(<ForestAnimationLayer disableAnimations paused />);

			const waveElement = container.querySelector('[data-animation="wave"]') as HTMLElement;
			expect(waveElement.style.animationName).toBe('none');
		});
	});
});
