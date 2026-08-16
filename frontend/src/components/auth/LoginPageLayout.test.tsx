import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginPageLayout } from './LoginPageLayout';

// ForestAnimationLayer (useReducedMotion) と ParticleCanvas (canvas/RAF) のモック
function setupBrowserMocks() {
	vi.stubGlobal(
		'matchMedia',
		vi.fn().mockImplementation(() => ({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
	vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
	vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

describe('LoginPageLayout', () => {
	beforeEach(() => {
		setupBrowserMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});
	describe('レイアウト構造', () => {
		it('children が表示されること', () => {
			render(
				<LoginPageLayout>
					<div data-testid="child">テストコンテンツ</div>
				</LoginPageLayout>,
			);

			// getByXxx は要素が存在しない場合例外をスローするため、成功 = 存在確認
			expect(screen.getByTestId('child')).toBeTruthy();
			expect(screen.getByText('テストコンテンツ')).toBeTruthy();
		});

		it('min-h-screen クラスが適用されていること', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);

			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/min-h-screen/);
		});

		it('relative クラスが適用されていること（絶対配置の子要素の基準になるため）', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);

			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/relative/);
		});

		it('overflow-hidden が適用されていること（アニメーション要素のはみ出しを防ぐ）', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);

			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/overflow-hidden/);
		});
	});

	describe('背景グラデーション', () => {
		it('深緑グラデーション背景が適用されていること', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);

			const wrapper = container.firstChild as HTMLElement;
			// 深緑グラデーション（bg-gradient-to-br または inline style で確認）
			expect(wrapper.className).toMatch(/bg-gradient/);
		});
	});

	describe('コンテンツエリア', () => {
		it('children が flex センタリングコンテナ内に配置されること', () => {
			render(
				<LoginPageLayout>
					<div data-testid="form-child">フォーム</div>
				</LoginPageLayout>,
			);

			const child = screen.getByTestId('form-child');
			const parent = child.parentElement as HTMLElement;
			expect(parent.className).toMatch(/flex/);
			expect(parent.className).toMatch(/items-center/);
			expect(parent.className).toMatch(/justify-center/);
		});

		it('children の親要素が z-index を持つこと（背景レイヤーより前面）', () => {
			render(
				<LoginPageLayout>
					<div data-testid="form-child">フォーム</div>
				</LoginPageLayout>,
			);

			const child = screen.getByTestId('form-child');
			const parent = child.parentElement as HTMLElement;
			expect(parent.className).toMatch(/z-10|z-\[/);
		});
	});

	describe('背景レイヤー', () => {
		it('absolute inset-0 のレイヤーが存在すること（アニメーション配置用）', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);

			// position: absolute + inset: 0 のレイヤーを探す
			const wrapper = container.firstChild as HTMLElement;
			const absoluteLayers = wrapper.querySelectorAll('[class*="absolute"]');
			expect(absoluteLayers.length).toBeGreaterThan(0);
		});

		it('背景レイヤーに pointer-events-none が適用されること', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);

			const wrapper = container.firstChild as HTMLElement;
			const pointerNoneLayers = wrapper.querySelectorAll('[class*="pointer-events-none"]');
			expect(pointerNoneLayers.length).toBeGreaterThan(0);
		});
	});

	describe('ダークモード非依存', () => {
		it('dark: クラスプレフィックスが使われていないこと（深緑テーマ固定）', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);

			// コンテナ全体のHTML文字列にdark:プレフィックスクラスがないことを確認
			expect(container.innerHTML).not.toMatch(/dark:[a-z]/);
		});
	});

	describe('アニメーションレイヤーの統合', () => {
		it('ForestAnimationLayer のアニメーション要素が描画されること', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);
			// ForestAnimationLayer は data-animation 属性付き要素（wave/fog/leaf）を描画する
			const animationElements = container.querySelectorAll('[data-animation]');
			expect(animationElements.length).toBeGreaterThan(0);
		});

		it('ParticleCanvas の canvas 要素が描画されること', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);
			const canvas = container.querySelector('canvas');
			expect(canvas).toBeTruthy();
		});

		it('アニメーション要素が pointer-events-none で操作を妨げないこと', () => {
			const { container } = render(
				<LoginPageLayout>
					<div>子要素</div>
				</LoginPageLayout>,
			);
			// ForestAnimationLayer のルート要素が pointer-events-none を持つ
			// data-animation なし親要素からも確認
			const allPointerNone = container.querySelectorAll('[class*="pointer-events-none"]');
			expect(allPointerNone.length).toBeGreaterThan(0);
		});
	});
});
