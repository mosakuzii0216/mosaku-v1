import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { EmailAuthForm } from './EmailAuthForm';

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({
		login: vi.fn(),
		register: vi.fn(),
		googleLogin: vi.fn(),
		githubLogin: vi.fn(),
		lineLogin: vi.fn(),
		appleLogin: vi.fn(),
		xLogin: vi.fn(),
	}),
}));

describe('EmailAuthForm - 森テーマスタイル', () => {
	describe('フォームカードのスタイル', () => {
		it('カードコンテナに bg-black/75 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const card = container.querySelector('[class*="bg-black\\/75"]');
			expect(card).toBeTruthy();
		});

		it('カードコンテナに border border-green-300/30 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const card = container.querySelector('[class*="border-green-300\\/30"]');
			expect(card).toBeTruthy();
		});

		it('カードコンテナに backdrop-blur-sm が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const card = container.querySelector('[class*="backdrop-blur-sm"]');
			expect(card).toBeTruthy();
		});
	});

	describe('入力フィールドのスタイル', () => {
		it('メールアドレス入力フィールドに bg-black/40 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const emailInput = container.querySelector('input[type="email"]') as HTMLElement;
			expect(emailInput.className).toMatch(/bg-black\/40/);
		});

		it('メールアドレス入力フィールドに border-green-700 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const emailInput = container.querySelector('input[type="email"]') as HTMLElement;
			expect(emailInput.className).toMatch(/border-green-700/);
		});
	});

	describe('送信ボタンのスタイル', () => {
		it('送信ボタンに bg-emerald-700 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const submitButton = container.querySelector('button[type="submit"]') as HTMLElement;
			expect(submitButton.className).toMatch(/bg-emerald-700/);
		});

		it('送信ボタンに hover:bg-emerald-600 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const submitButton = container.querySelector('button[type="submit"]') as HTMLElement;
			expect(submitButton.className).toMatch(/hover:bg-emerald-600/);
		});
	});

	describe('区切り線のスタイル', () => {
		it('区切り線に border-green-800 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const divider = container.querySelector('[class*="border-green-800"]');
			expect(divider).toBeTruthy();
		});

		it('区切りラベルに text-green-600 が適用されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			const dividerLabel = container.querySelector('[class*="text-green-600"]');
			expect(dividerLabel).toBeTruthy();
		});
	});

	describe('OAuthLoginButton への variant 伝播', () => {
		it('OAuthLoginButton が variant="forest" で描画されること', () => {
			const { container } = render(
				<EmailAuthForm mode="login" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />,
			);
			// forest variant 適用時は bg-black/40 が OAuthLoginButton のボタンに存在する
			const oauthButtons = container.querySelectorAll('button[class*="bg-black\\/40"]');
			expect(oauthButtons.length).toBeGreaterThan(0);
		});
	});
});
