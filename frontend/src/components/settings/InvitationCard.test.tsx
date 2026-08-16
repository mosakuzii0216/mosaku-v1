import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { ApiError } from '../../utils/apiError';
import type { InvitationWithShareUrlResponse, UserQuotaResponse } from '../../types/invitation';
import type { ShareInvitationResult } from '../../utils/shareInvitation';

const getMyInvitations = vi.fn();
const getMyInvitationQuota = vi.fn();
const createMyInvitation = vi.fn();
const deleteMyInvitation = vi.fn();
const shareInvitationMock = vi.fn();

vi.mock('../../utils/api', () => ({
	apiClient: {
		getMyInvitations: (...args: unknown[]) => getMyInvitations(...args),
		getMyInvitationQuota: (...args: unknown[]) => getMyInvitationQuota(...args),
		createMyInvitation: (...args: unknown[]) => createMyInvitation(...args),
		deleteMyInvitation: (...args: unknown[]) => deleteMyInvitation(...args),
	},
}));

vi.mock('../../utils/shareInvitation', () => ({
	shareInvitation: (...args: unknown[]) => shareInvitationMock(...args),
}));

import { InvitationCard } from './InvitationCard';

function renderCard() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	return render(
		React.createElement(QueryClientProvider, { client }, React.createElement(InvitationCard)),
	);
}

const baseInvitation: InvitationWithShareUrlResponse = {
	id: 'inv-1',
	code: 'k9x7m2j3pq',
	shareUrl: 'https://mosaku.jp/invite/k9x7m2j3pq',
	maxUses: 1,
	usedCount: 0,
	expiresAt: null,
	createdAt: '2026-05-24T00:00:00Z',
};

const userQuota: UserQuotaResponse = {
	invitationQuota: 3,
	unlimited: false,
	role: 'USER',
};

const exhaustedQuota: UserQuotaResponse = {
	invitationQuota: 0,
	unlimited: false,
	role: 'USER',
};

const adminQuota: UserQuotaResponse = {
	invitationQuota: 5,
	unlimited: true,
	role: 'ADMIN',
};

describe('InvitationCard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// confirm のデフォルト挙動を承認に
		vi.spyOn(window, 'confirm').mockReturnValue(true);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('quota 可視化 (Req 4.6, 5.1)', () => {
		it('USER ロールの quota 残数をバッジ表示する', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([]);

			renderCard();

			await waitFor(() => {
				expect(screen.getByTestId('invitation-quota-badge').textContent).toContain('3');
			});
			expect(screen.getByTestId('invitation-quota-badge').textContent).toContain('5');
		});

		it('ADMIN は「無制限」表示になる', async () => {
			getMyInvitationQuota.mockResolvedValue(adminQuota);
			getMyInvitations.mockResolvedValue([]);

			renderCard();

			await waitFor(() => {
				expect(screen.getByTestId('invitation-quota-badge').textContent).toContain('無制限');
			});
		});
	});

	describe('発行ボタン (Req 5.2, 5.6)', () => {
		it('quota が 1 以上なら発行ボタンが有効で、押下すると createMyInvitation を mutate する', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([]);
			createMyInvitation.mockResolvedValue(baseInvitation);

			renderCard();

			// quota がロードされてバッジが「残り 3」になるのを待つ
			await waitFor(() =>
				expect(screen.getByTestId('invitation-quota-badge').textContent).toContain('3'),
			);
			const button = screen.getByRole('button', { name: /招待リンクを発行/ });
			expect((button as HTMLButtonElement).disabled).toBe(false);

			await act(async () => {
				fireEvent.click(button);
			});

			await waitFor(() => expect(createMyInvitation).toHaveBeenCalledTimes(1));
		});

		it('quota 0 かつ USER のときは disabled になり、ツールチップ文言を出す', async () => {
			getMyInvitationQuota.mockResolvedValue(exhaustedQuota);
			getMyInvitations.mockResolvedValue([]);

			renderCard();

			await waitFor(() =>
				expect(screen.getByTestId('invitation-quota-badge').textContent).toContain('0'),
			);
			const button = screen.getByRole('button', { name: /招待リンクを発行/ });
			expect((button as HTMLButtonElement).disabled).toBe(true);
			expect(button.getAttribute('title')).toContain('招待枠を使い切りました');
		});

		it('ADMIN は quota 0 表示でも disabled にならない', async () => {
			getMyInvitationQuota.mockResolvedValue({ ...adminQuota, invitationQuota: 0 });
			getMyInvitations.mockResolvedValue([]);

			renderCard();

			await waitFor(() =>
				expect(screen.getByTestId('invitation-quota-badge').textContent).toContain('無制限'),
			);
			const button = screen.getByRole('button', { name: /招待リンクを発行/ });
			expect((button as HTMLButtonElement).disabled).toBe(false);
		});

		it('発行時に QUOTA_EXHAUSTED エラーが返ったら日本語メッセージを表示する', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([]);
			createMyInvitation.mockRejectedValue(
				new ApiError({
					code: 'INV005',
					message: '招待枠を使い切りました',
					statusCode: 400,
				}),
			);

			renderCard();
			const button = await screen.findByRole('button', { name: /招待リンクを発行/ });
			await act(async () => {
				fireEvent.click(button);
			});

			await waitFor(() =>
				expect(screen.getByTestId('invitation-feedback').textContent).toContain(
					'招待枠を使い切りました',
				),
			);
		});
	});

	describe('発行済み一覧 (Req 5.5)', () => {
		it('発行済み招待コード一覧に code / usedCount / maxUses / 発行日を表示する', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([baseInvitation]);

			renderCard();

			await waitFor(() => expect(screen.getByText('k9x7m2j3pq')).toBeTruthy());
			expect(screen.getByText('0/1')).toBeTruthy();
			expect(screen.getByRole('button', { name: /共有/ })).toBeTruthy();
			expect(screen.getByRole('button', { name: /削除/ })).toBeTruthy();
		});

		it('削除ボタンで deleteMyInvitation を呼ぶ', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([baseInvitation]);
			deleteMyInvitation.mockResolvedValue(undefined);

			renderCard();
			const deleteButton = await screen.findByRole('button', { name: /削除/ });

			await act(async () => {
				fireEvent.click(deleteButton);
			});

			await waitFor(() => expect(deleteMyInvitation).toHaveBeenCalledWith({ id: 'inv-1' }));
		});
	});

	describe('共有 (Req 5.3, 5.4)', () => {
		it('共有ボタン押下で shareInvitation(shareUrl) を呼ぶ', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([baseInvitation]);
			const result: ShareInvitationResult = { method: 'web-share' };
			shareInvitationMock.mockResolvedValue(result);

			renderCard();
			const shareButton = await screen.findByRole('button', { name: /共有/ });

			await act(async () => {
				fireEvent.click(shareButton);
			});

			expect(shareInvitationMock).toHaveBeenCalledWith({
				shareUrl: baseInvitation.shareUrl,
				inviterName: null,
			});
		});

		it('clipboard 経由ならコピー完了の toast を出す', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([baseInvitation]);
			const result: ShareInvitationResult = { method: 'clipboard' };
			shareInvitationMock.mockResolvedValue(result);

			renderCard();
			const shareButton = await screen.findByRole('button', { name: /共有/ });

			await act(async () => {
				fireEvent.click(shareButton);
			});

			await waitFor(() =>
				expect(screen.getByTestId('invitation-feedback').textContent).toContain(
					'招待リンクをコピーしました',
				),
			);
		});

		it('failed 結果は失敗メッセージを出す', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([baseInvitation]);
			const result: ShareInvitationResult = {
				method: 'failed',
				error: new Error('boom'),
			};
			shareInvitationMock.mockResolvedValue(result);

			renderCard();
			const shareButton = await screen.findByRole('button', { name: /共有/ });

			await act(async () => {
				fireEvent.click(shareButton);
			});

			await waitFor(() =>
				expect(screen.getByTestId('invitation-feedback').textContent).toContain('共有に失敗'),
			);
		});

		it('AbortError（ユーザーキャンセル）は無音（feedback を表示しない）', async () => {
			getMyInvitationQuota.mockResolvedValue(userQuota);
			getMyInvitations.mockResolvedValue([baseInvitation]);
			const result: ShareInvitationResult = { method: 'web-share', cancelled: true };
			shareInvitationMock.mockResolvedValue(result);

			renderCard();
			const shareButton = await screen.findByRole('button', { name: /共有/ });

			await act(async () => {
				fireEvent.click(shareButton);
			});

			// 何もメッセージが出ないこと（feedback testid 自体が存在しない）
			expect(screen.queryByTestId('invitation-feedback')).toBeNull();
		});
	});
});
