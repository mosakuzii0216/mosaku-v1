import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import AuthForm from './AuthForm';

vi.mock('react-router', () => ({
	useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({
		googleRegisterWithInvitation: vi.fn(),
		githubRegisterWithInvitation: vi.fn(),
		lineRegisterWithInvitation: vi.fn(),
		appleRegisterWithInvitation: vi.fn(),
		xRegisterWithInvitation: vi.fn(),
		login: vi.fn(),
		register: vi.fn(),
		googleLogin: vi.fn(),
		githubLogin: vi.fn(),
		lineLogin: vi.fn(),
		appleLogin: vi.fn(),
		xLogin: vi.fn(),
		resetPassword: vi.fn(),
	}),
}));

describe('AuthForm - LoginPageLayout 統合', () => {
	beforeEach(() => {
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
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	describe('LoginPageLayout ラッピング', () => {
		it('最外コンテナに深緑グラデーション背景が適用されること（LoginPageLayout が有効）', () => {
			const { container } = render(<AuthForm />);
			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/bg-gradient/);
		});

		it('最外コンテナに min-h-screen が適用されること', () => {
			const { container } = render(<AuthForm />);
			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper.className).toMatch(/min-h-screen/);
		});

		it('ForestAnimationLayer が描画されること（data-animation 要素が存在する）', () => {
			const { container } = render(<AuthForm />);
			const animationElements = container.querySelectorAll('[data-animation]');
			expect(animationElements.length).toBeGreaterThan(0);
		});

		it('フォームカードが z-index レイヤー内に配置されること', () => {
			const { container } = render(<AuthForm />);
			// z-10 以上の要素が存在すること
			const zLayerEl = container.querySelector('[class*="z-10"]');
			expect(zLayerEl).toBeTruthy();
		});
	});

	describe('既存フロー維持', () => {
		it('デフォルトで EmailAuthForm（login モード）が描画されること', () => {
			const { container } = render(<AuthForm />);
			// login モードではメールアドレス入力フィールドが存在する
			const emailInput = container.querySelector('input[type="email"]');
			expect(emailInput).toBeTruthy();
		});

		it('フォームカードが森テーマスタイル（bg-black/75）を持つこと', () => {
			const { container } = render(<AuthForm />);
			const card = container.querySelector('[class*="bg-black\\/75"]');
			expect(card).toBeTruthy();
		});
	});
});
