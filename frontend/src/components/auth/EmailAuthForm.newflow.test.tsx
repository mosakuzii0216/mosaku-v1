import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailAuthForm } from './EmailAuthForm';
import { ApiError } from '../../utils/apiError';

const register = vi.fn();
const login = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({
		register: (...args: unknown[]) => register(...args),
		login: (...args: unknown[]) => login(...args),
		googleLogin: vi.fn(),
		githubLogin: vi.fn(),
		lineLogin: vi.fn(),
		appleLogin: vi.fn(),
		xLogin: vi.fn(),
	}),
}));

describe('EmailAuthForm - 新フロー対応 (タスク7.2)', () => {
	beforeEach(() => {
		register.mockReset();
		login.mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('招待コード入力欄の属性 (Req 2.4)', () => {
		it('autoCapitalize="off" が付与されている', () => {
			render(<EmailAuthForm mode="signup" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />);
			const input = document.getElementById('invitationCode') as HTMLInputElement;
			expect(input.getAttribute('autocapitalize')).toBe('off');
		});

		it('autoComplete="off" が付与されている', () => {
			render(<EmailAuthForm mode="signup" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />);
			const input = document.getElementById('invitationCode') as HTMLInputElement;
			expect(input.getAttribute('autocomplete')).toBe('off');
		});

		it('inputMode="text" が付与されている', () => {
			render(<EmailAuthForm mode="signup" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />);
			const input = document.getElementById('invitationCode') as HTMLInputElement;
			expect(input.getAttribute('inputmode')).toBe('text');
		});

		it('spellCheck={false} が付与されている', () => {
			render(<EmailAuthForm mode="signup" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />);
			const input = document.getElementById('invitationCode') as HTMLInputElement;
			expect(input.getAttribute('spellcheck')).toBe('false');
		});
	});

	describe('prefilledInvitationCode の挙動 (Req 1.5)', () => {
		it('prefilledInvitationCode が入力欄の初期値に反映される', () => {
			render(
				<EmailAuthForm
					mode="signup"
					prefilledInvitationCode="k9x7m2j3pq"
					onSwitchMode={vi.fn()}
					onForgotPassword={vi.fn()}
				/>,
			);
			const input = document.getElementById('invitationCode') as HTMLInputElement;
			expect(input.value).toBe('k9x7m2j3pq');
		});

		it('prefill されていても入力欄が編集可能 (readOnly でない)', () => {
			render(
				<EmailAuthForm
					mode="signup"
					prefilledInvitationCode="k9x7m2j3pq"
					onSwitchMode={vi.fn()}
					onForgotPassword={vi.fn()}
				/>,
			);
			const input = document.getElementById('invitationCode') as HTMLInputElement;
			expect(input.hasAttribute('readonly')).toBe(false);
			expect(input.hasAttribute('disabled')).toBe(false);

			fireEvent.change(input, { target: { value: 'différent' } });
			expect(input.value).toBe('différent');
		});
	});

	describe('自動ログイン文言の削除 (Req 8.3)', () => {
		it('signup 成功後に「Registration successful!」文言が表示されない', async () => {
			register.mockResolvedValueOnce(undefined);
			render(<EmailAuthForm mode="signup" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />);

			fireEvent.change(document.getElementById('email') as HTMLInputElement, {
				target: { value: 'test@example.com' },
			});
			fireEvent.change(document.getElementById('password') as HTMLInputElement, {
				target: { value: 'P@ssword123' },
			});
			fireEvent.change(document.getElementById('invitationCode') as HTMLInputElement, {
				target: { value: 'k9x7m2j3pq' },
			});

			fireEvent.click(screen.getByRole('button', { name: '新規登録' }));

			await waitFor(() => expect(register).toHaveBeenCalled());
			expect(screen.queryByText(/Registration successful/i)).toBeNull();
			expect(screen.queryByText(/login with your credentials/i)).toBeNull();
		});
	});

	describe('ApiError.code ベースのエラー判定 (Req 7.2, 7.3)', () => {
		it('signup 失敗時に ApiError.code から resolveInvitationErrorMessage で文言を表示する', async () => {
			register.mockRejectedValueOnce(
				new ApiError({ code: 'INV005', message: 'Quota exhausted (raw)', statusCode: 400 }),
			);
			render(<EmailAuthForm mode="signup" onSwitchMode={vi.fn()} onForgotPassword={vi.fn()} />);

			fireEvent.change(document.getElementById('email') as HTMLInputElement, {
				target: { value: 'test@example.com' },
			});
			fireEvent.change(document.getElementById('password') as HTMLInputElement, {
				target: { value: 'P@ssword123' },
			});
			fireEvent.change(document.getElementById('invitationCode') as HTMLInputElement, {
				target: { value: 'k9x7m2j3pq' },
			});

			fireEvent.click(screen.getByRole('button', { name: '新規登録' }));

			await waitFor(() => expect(screen.getByText('招待枠を使い切りました')).toBeTruthy());
		});
	});
});
