import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import InvitePage from './InvitePage';
import { ApiError } from '../../utils/apiError';
import type { InvitationContextResponse } from '../../types/invitation';

const verifyInvitationContext = vi.fn();
const navigateMock = vi.fn();

vi.mock('react-router', async () => {
	const actual = await vi.importActual<typeof import('react-router')>('react-router');
	return {
		...actual,
		useNavigate: () => navigateMock,
		useSearchParams: () => [new URLSearchParams()],
	};
});

vi.mock('../../utils/api', () => ({
	apiClient: {
		verifyInvitationContext: (...args: unknown[]) => verifyInvitationContext(...args),
		startOAuthRegistration: vi.fn(),
	},
}));

const authState: {
	user: { id: string } | null;
	loading: boolean;
} = { user: null, loading: false };

vi.mock('../../contexts/AuthContext', () => ({
	useAuth: () => ({
		user: authState.user,
		loading: authState.loading,
		register: vi.fn(),
		login: vi.fn(),
		googleLogin: vi.fn(),
		githubLogin: vi.fn(),
		lineLogin: vi.fn(),
		appleLogin: vi.fn(),
		xLogin: vi.fn(),
		resetPassword: vi.fn(),
	}),
}));

function renderInvitePage(code: string) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		React.createElement(
			QueryClientProvider,
			{ client },
			React.createElement(
				MemoryRouter,
				{ initialEntries: [`/invite/${code}`] },
				React.createElement(
					Routes,
					null,
					React.createElement(Route, {
						path: '/invite/:code',
						element: React.createElement(InvitePage),
					}),
				),
			),
		),
	);
}

describe('InvitePage', () => {
	beforeEach(() => {
		verifyInvitationContext.mockReset();
		navigateMock.mockReset();
		authState.user = null;
		authState.loading = false;
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
	});

	describe('成功時 (Req 1.1, 1.2, 6.1, 6.3)', () => {
		it('招待者の表示名が画面に出る', async () => {
			const mockResponse: InvitationContextResponse = {
				code: 'k9x7m2j3pq',
				status: 'valid',
				creator: { name: 'モサ子', maskedId: 'usr1***' },
				expiresAt: null,
				usesRemaining: 1,
			};
			verifyInvitationContext.mockResolvedValue(mockResponse);

			renderInvitePage('k9x7m2j3pq');
			await waitFor(() => expect(screen.getByText(/モサ子さんから招待されました/)).toBeTruthy());
		});

		it('招待者の name が null のとき汎用文言を出す', async () => {
			verifyInvitationContext.mockResolvedValue({
				code: 'k9x7m2j3pq',
				status: 'valid',
				creator: { name: null, maskedId: 'usr1***' },
				expiresAt: null,
				usesRemaining: 1,
			});

			renderInvitePage('k9x7m2j3pq');
			await waitFor(() => expect(screen.getByText(/あるユーザーから招待されました/)).toBeTruthy());
		});

		it('招待コード入力欄に prefill 値が入る', async () => {
			verifyInvitationContext.mockResolvedValue({
				code: 'k9x7m2j3pq',
				status: 'valid',
				creator: { name: 'モサ子', maskedId: 'usr1***' },
				expiresAt: null,
				usesRemaining: 1,
			});

			renderInvitePage('k9x7m2j3pq');
			await waitFor(() => {
				const input = document.getElementById('invitationCode') as HTMLInputElement;
				expect(input.value).toBe('k9x7m2j3pq');
			});
		});
	});

	describe('エラー時 (Req 1.3)', () => {
		it('INVALID_CODE のとき「招待コードが無効です」を表示する', async () => {
			verifyInvitationContext.mockRejectedValue(
				new ApiError({ code: 'INV001', message: 'raw', statusCode: 400 }),
			);

			renderInvitePage('badcode');
			await waitFor(() => expect(screen.getByText('招待コードが無効です')).toBeTruthy());
			expect(screen.getByRole('button', { name: /トップへ戻る/ })).toBeTruthy();
		});

		it('EXPIRED のとき期限切れ文言を表示する', async () => {
			verifyInvitationContext.mockRejectedValue(
				new ApiError({ code: 'INV002', message: 'raw', statusCode: 400 }),
			);

			renderInvitePage('expired');
			await waitFor(() =>
				expect(screen.getByText('招待コードの有効期限が切れています')).toBeTruthy(),
			);
		});

		it('MAX_USES_REACHED のとき使用上限文言を表示する', async () => {
			verifyInvitationContext.mockRejectedValue(
				new ApiError({ code: 'INV003', message: 'raw', statusCode: 400 }),
			);

			renderInvitePage('maxed');
			await waitFor(() =>
				expect(screen.getByText('招待コードの使用上限に達しました')).toBeTruthy(),
			);
		});
	});

	describe('認証済みリダイレクト (Req 1.4)', () => {
		it('認証済みなら / に navigate(replace) を呼ぶ', async () => {
			authState.user = { id: 'u1' };
			verifyInvitationContext.mockResolvedValue({
				code: 'k9x7m2j3pq',
				status: 'valid',
				creator: { name: 'モサ子', maskedId: 'usr1***' },
				expiresAt: null,
				usesRemaining: 1,
			});

			renderInvitePage('k9x7m2j3pq');
			await waitFor(() => {
				expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
			});
		});
	});
});
