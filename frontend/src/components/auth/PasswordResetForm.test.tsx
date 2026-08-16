import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PasswordResetForm } from './PasswordResetForm';

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({
		resetPassword: vi.fn(),
	}),
}));

vi.mock('../../utils/logger', () => ({
	logger: { error: vi.fn() },
}));

describe('PasswordResetForm - 森テーマスタイル', () => {
	describe('フォームカードのスタイル', () => {
		it('カードコンテナに bg-black/75 が適用されること', () => {
			const { container } = render(<PasswordResetForm onBackToLogin={vi.fn()} />);
			const card = container.querySelector('[class*="bg-black\\/75"]');
			expect(card).toBeTruthy();
		});

		it('カードコンテナに border-green-300/30 が適用されること', () => {
			const { container } = render(<PasswordResetForm onBackToLogin={vi.fn()} />);
			const card = container.querySelector('[class*="border-green-300\\/30"]');
			expect(card).toBeTruthy();
		});
	});

	describe('入力フィールドのスタイル', () => {
		it('メールアドレス入力フィールドに bg-black/40 が適用されること', () => {
			const { container } = render(<PasswordResetForm onBackToLogin={vi.fn()} />);
			const input = container.querySelector('input[type="email"]') as HTMLElement;
			expect(input.className).toMatch(/bg-black\/40/);
		});

		it('メールアドレス入力フィールドに border-green-700 が適用されること', () => {
			const { container } = render(<PasswordResetForm onBackToLogin={vi.fn()} />);
			const input = container.querySelector('input[type="email"]') as HTMLElement;
			expect(input.className).toMatch(/border-green-700/);
		});
	});

	describe('送信ボタンのスタイル', () => {
		it('送信ボタンに bg-emerald-700 が適用されること', () => {
			const { container } = render(<PasswordResetForm onBackToLogin={vi.fn()} />);
			const button = container.querySelector('button[type="submit"]') as HTMLElement;
			expect(button.className).toMatch(/bg-emerald-700/);
		});
	});

	describe('リンクテキストのスタイル', () => {
		it('戻るボタンに text-emerald-400 が適用されること', () => {
			const { container } = render(<PasswordResetForm onBackToLogin={vi.fn()} />);
			const backButton = container.querySelector('button[type="button"]') as HTMLElement;
			expect(backButton.className).toMatch(/text-emerald-400/);
		});
	});
});
