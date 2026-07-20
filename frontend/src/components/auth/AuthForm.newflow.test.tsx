import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import AuthForm from './AuthForm';
import { ApiError } from '../../utils/apiError';
import type { InvitationContextResponse } from '../../types/invitation';

const startOAuthRegistration = vi.fn();

vi.mock('react-router', () => ({
	useSearchParams: () => [new URLSearchParams()],
}));

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({
		login: vi.fn(),
		register: vi.fn(),
		googleLogin: vi.fn(),
		appleLogin: vi.fn(),
		xLogin: vi.fn(),
		resetPassword: vi.fn(),
	}),
}));

vi.mock('../../utils/api', () => ({
	apiClient: {
		startOAuthRegistration: (...args: unknown[]) => startOAuthRegistration(...args),
	},
}));

function withQuery(children: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return React.createElement(QueryClientProvider, { client }, children);
}

const baseContext: InvitationContextResponse = {
	code: 'k9x7m2j3pq',
	status: 'valid',
	creator: { name: 'モサ子', maskedId: 'usr1***' },
	expiresAt: null,
	usesRemaining: 1,
	perk: { type: 'none' },
};

describe('AuthForm - 新フロー (タスク7.2)', () => {
	beforeEach(() => {
		startOAuthRegistration.mockReset();
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

	describe('招待モード (prefilledInvitationCode 渡し)', () => {
		it('signup モードがデフォルトで表示される', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			expect(screen.getByRole('heading', { name: '新規登録' })).toBeTruthy();
		});

		it('招待者の表示名が画面上に表示される', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			expect(screen.getByText(/モサ子さんから招待されました/)).toBeTruthy();
		});

		it('招待者の name が null の場合は汎用文言にフォールバックする', () => {
			render(
				withQuery(
					<AuthForm
						prefilledInvitationCode="k9x7m2j3pq"
						inviterContext={{
							...baseContext,
							creator: { name: null, maskedId: 'usr1***' },
						}}
					/>,
				),
			);
			expect(screen.getByText(/あるユーザーから招待されました/)).toBeTruthy();
		});

		it('招待コードが適用済みとして読み取り専用表示される（編集 input なし）', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			// 編集可能な input は出ない
			const input = document.getElementById('invitationCode') as HTMLInputElement;
			expect(input).toBeNull();
			// コードが読み取り専用で表示される
			expect(screen.getByText('k9x7m2j3pq')).toBeTruthy();
		});

		it('Google で登録ボタンを押すと startOAuthRegistration が呼ばれる', async () => {
			startOAuthRegistration.mockResolvedValue({ authorizationUrl: 'https://google/auth' });
			const assignMock = vi.fn();
			Object.defineProperty(window, 'location', {
				configurable: true,
				value: { ...window.location, assign: assignMock },
			});

			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);

			fireEvent.click(screen.getByRole('button', { name: /Googleで登録/ }));

			await waitFor(() => {
				expect(startOAuthRegistration).toHaveBeenCalledWith({
					provider: 'google',
					invitationCode: 'k9x7m2j3pq',
				});
			});
			await waitFor(() => {
				expect(assignMock).toHaveBeenCalledWith('https://google/auth');
			});
		});

		it('Google は主要手段として常に表示される', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			expect(screen.getByRole('button', { name: /Googleで登録/ })).toBeTruthy();
		});

		it('GitHub は展開前に非表示', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			expect(screen.queryByRole('button', { name: /GitHubで登録/ })).toBeNull();
		});

		it('「他の方法で登録」展開後は Apple / X のみ表示され GitHub / LINE は現れない', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			fireEvent.click(screen.getByRole('button', { name: '他の方法で登録' }));

			expect(screen.getByRole('button', { name: /Appleで登録/ })).toBeTruthy();
			expect(screen.getByRole('button', { name: /Xで登録/ })).toBeTruthy();
			expect(screen.queryByRole('button', { name: /GitHubで登録/ })).toBeNull();
			expect(screen.queryByRole('button', { name: /LINEで登録/ })).toBeNull();
		});

		it('ログイン導線が表示される', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			expect(screen.getByText(/ログイン/)).toBeTruthy();
		});

		it('comp perk のとき PerkBadge が表示される', () => {
			render(
				withQuery(
					<AuthForm
						prefilledInvitationCode="k9x7m2j3pq"
						inviterContext={{ ...baseContext, perk: { type: 'comp', months: 3 } }}
					/>,
				),
			);
			expect(screen.getByText(/AI 無料枠つき/)).toBeTruthy();
		});

		it('none perk のとき PerkBadge が非表示', () => {
			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);
			expect(screen.queryByText(/AI 無料枠つき/)).toBeNull();
		});

		it('startOAuthRegistration が ApiError を投げたとき invitationErrorMessages の文言を表示する', async () => {
			startOAuthRegistration.mockRejectedValue(
				new ApiError({ code: 'INV002', message: 'raw', statusCode: 400 }),
			);

			render(
				withQuery(<AuthForm prefilledInvitationCode="k9x7m2j3pq" inviterContext={baseContext} />),
			);

			fireEvent.click(screen.getByRole('button', { name: /Googleで登録/ }));

			await waitFor(() =>
				expect(screen.getByText('招待コードの有効期限が切れています')).toBeTruthy(),
			);
		});
	});

	describe('既存フローの後方互換', () => {
		it('props なしで描画したときは login モードがデフォルト', () => {
			render(withQuery(<AuthForm />));
			const emailInput = document.querySelector('input[type="email"]');
			expect(emailInput).toBeTruthy();
		});
	});
});
