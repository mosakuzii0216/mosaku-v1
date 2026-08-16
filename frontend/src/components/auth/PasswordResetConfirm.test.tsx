import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import PasswordResetConfirm from './PasswordResetConfirm';

vi.mock('../../utils/auth', () => ({
	AuthAPI: {
		confirmPasswordReset: vi.fn(),
	},
}));

vi.mock('../../utils/logger', () => ({
	logger: { error: vi.fn() },
}));

vi.mock('../../utils/passwordValidator', async (importOriginal) => {
	return await importOriginal();
});

import { AuthAPI } from '../../utils/auth';

function renderWithToken(token?: string) {
	const search = token ? `?token=${token}` : '';
	return render(
		<MemoryRouter initialEntries={[`/auth/reset-password/confirm${search}`]}>
			<Routes>
				<Route path="/auth/reset-password/confirm" element={<PasswordResetConfirm />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe('PasswordResetConfirm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('トークン欠落時', () => {
		it('トークンがない場合はエラーメッセージを表示する', () => {
			renderWithToken();
			expect(screen.getByText(/無効なリセットリンク/)).toBeTruthy();
		});

		it('ログインページへの導線が表示される', () => {
			renderWithToken();
			expect(screen.getByText(/ログインページ/)).toBeTruthy();
		});
	});

	describe('トークン付き正常表示', () => {
		it('新しいパスワード入力フィールドが表示される', () => {
			renderWithToken('valid-token-hex');
			expect(screen.getByLabelText(/新しいパスワード/)).toBeTruthy();
		});

		it('パスワード確認入力フィールドが表示される', () => {
			renderWithToken('valid-token-hex');
			expect(screen.getByLabelText(/パスワード確認/)).toBeTruthy();
		});

		it('送信ボタンが表示される', () => {
			renderWithToken('valid-token-hex');
			expect(screen.getByRole('button', { name: /パスワードを再設定/ })).toBeTruthy();
		});
	});

	describe('バリデーション', () => {
		it('パスワードが一致しない場合はエラーを表示する', async () => {
			renderWithToken('valid-token-hex');

			fireEvent.change(screen.getByLabelText(/新しいパスワード/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.change(screen.getByLabelText(/パスワード確認/), {
				target: { value: 'DifferentPass1' },
			});
			fireEvent.click(screen.getByRole('button', { name: /パスワードを再設定/ }));

			expect(screen.getByText(/パスワードが一致しません/)).toBeTruthy();
			expect(AuthAPI.confirmPasswordReset).not.toHaveBeenCalled();
		});

		it('パスワード強度が不足している場合はエラーを表示する', async () => {
			renderWithToken('valid-token-hex');

			fireEvent.change(screen.getByLabelText(/新しいパスワード/), {
				target: { value: 'weak' },
			});
			fireEvent.change(screen.getByLabelText(/パスワード確認/), {
				target: { value: 'weak' },
			});
			fireEvent.click(screen.getByRole('button', { name: /パスワードを再設定/ }));

			expect(screen.getByText(/パスワードが要件を満たしていません/)).toBeTruthy();
			expect(AuthAPI.confirmPasswordReset).not.toHaveBeenCalled();
		});
	});

	describe('確定成功', () => {
		it('成功後に完了メッセージが表示される', async () => {
			vi.mocked(AuthAPI.confirmPasswordReset).mockResolvedValue({
				message: 'パスワードを再設定しました',
			});
			renderWithToken('valid-token-hex');

			fireEvent.change(screen.getByLabelText(/新しいパスワード/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.change(screen.getByLabelText(/パスワード確認/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.click(screen.getByRole('button', { name: /パスワードを再設定/ }));

			await waitFor(() => {
				expect(screen.getByText(/パスワードを再設定しました/)).toBeTruthy();
			});
		});

		it('成功後にログイン導線が表示される', async () => {
			vi.mocked(AuthAPI.confirmPasswordReset).mockResolvedValue({
				message: 'パスワードを再設定しました',
			});
			renderWithToken('valid-token-hex');

			fireEvent.change(screen.getByLabelText(/新しいパスワード/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.change(screen.getByLabelText(/パスワード確認/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.click(screen.getByRole('button', { name: /パスワードを再設定/ }));

			await waitFor(() => {
				expect(screen.getByText(/ログインページ/)).toBeTruthy();
			});
		});

		it('confirmPasswordReset が token と newPassword で呼ばれる', async () => {
			vi.mocked(AuthAPI.confirmPasswordReset).mockResolvedValue({
				message: 'パスワードを再設定しました',
			});
			renderWithToken('my-reset-token');

			fireEvent.change(screen.getByLabelText(/新しいパスワード/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.change(screen.getByLabelText(/パスワード確認/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.click(screen.getByRole('button', { name: /パスワードを再設定/ }));

			await waitFor(() => {
				expect(AuthAPI.confirmPasswordReset).toHaveBeenCalledWith('my-reset-token', 'ValidPass1');
			});
		});
	});

	describe('確定失敗', () => {
		it('API エラー時にエラーメッセージを表示する', async () => {
			vi.mocked(AuthAPI.confirmPasswordReset).mockRejectedValue(new Error('トークンが無効です'));
			renderWithToken('bad-token');

			fireEvent.change(screen.getByLabelText(/新しいパスワード/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.change(screen.getByLabelText(/パスワード確認/), {
				target: { value: 'ValidPass1' },
			});
			fireEvent.click(screen.getByRole('button', { name: /パスワードを再設定/ }));

			await waitFor(() => {
				expect(screen.getByText(/トークンが無効です/)).toBeTruthy();
			});
		});
	});

	describe('スタイル（森テーマ）', () => {
		it('カードコンテナに bg-black/75 が適用されること', () => {
			const { container } = renderWithToken('valid-token-hex');
			const card = container.querySelector('[class*="bg-black\\/75"]');
			expect(card).toBeTruthy();
		});

		it('送信ボタンに bg-emerald-700 が適用されること', () => {
			const { container } = renderWithToken('valid-token-hex');
			const button = container.querySelector('button[type="submit"]') as HTMLElement;
			expect(button?.className).toMatch(/bg-emerald-700/);
		});
	});
});
