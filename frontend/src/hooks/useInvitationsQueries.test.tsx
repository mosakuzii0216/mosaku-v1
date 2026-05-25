import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import { ApiError } from '../utils/apiError';
import type {
	InvitationContextResponse,
	InvitationWithShareUrlResponse,
	UserQuotaResponse,
} from '../types/invitation';

const verifyInvitationContext = vi.fn();
const createMyInvitation = vi.fn();
const getMyInvitations = vi.fn();
const getMyInvitationQuota = vi.fn();
const deleteMyInvitation = vi.fn();
const startOAuthRegistration = vi.fn();

vi.mock('../utils/api', () => ({
	apiClient: {
		verifyInvitationContext: (...args: unknown[]) => verifyInvitationContext(...args),
		createMyInvitation: (...args: unknown[]) => createMyInvitation(...args),
		getMyInvitations: (...args: unknown[]) => getMyInvitations(...args),
		getMyInvitationQuota: (...args: unknown[]) => getMyInvitationQuota(...args),
		deleteMyInvitation: (...args: unknown[]) => deleteMyInvitation(...args),
		startOAuthRegistration: (...args: unknown[]) => startOAuthRegistration(...args),
	},
}));

import {
	useInvitationContext,
	useMyInvitations,
	useMyInvitationQuota,
	useCreateMyInvitation,
	useDeleteMyInvitation,
	useStartOAuthRegistration,
} from './useInvitationsQueries';

function makeWrapper(): {
	wrapper: (props: { children: ReactNode }) => React.JSX.Element;
	client: QueryClient;
} {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	const wrapper = ({ children }: { children: ReactNode }) =>
		React.createElement(QueryClientProvider, { client }, children);
	return { wrapper, client };
}

describe('useInvitationContext', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('code が空文字の場合は enabled: false で fetch されない', () => {
		const { wrapper } = makeWrapper();
		renderHook(() => useInvitationContext({ code: '' }), { wrapper });
		expect(verifyInvitationContext).not.toHaveBeenCalled();
	});

	it('code が指定された場合に apiClient.verifyInvitationContext を呼ぶ', async () => {
		const mockResponse: InvitationContextResponse = {
			code: 'k9x7m2j3pq',
			status: 'valid',
			creator: { name: 'モサ子', maskedId: 'usr1***' },
			expiresAt: null,
			usesRemaining: 1,
		};
		verifyInvitationContext.mockResolvedValue(mockResponse);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useInvitationContext({ code: 'k9x7m2j3pq' }), { wrapper });

		await waitFor(() => expect(result.current.data).toEqual(mockResponse));
		expect(verifyInvitationContext).toHaveBeenCalledWith({ code: 'k9x7m2j3pq' });
	});

	it('ApiError を retry なしでそのまま伝播する', async () => {
		verifyInvitationContext.mockRejectedValue(
			new ApiError({ code: 'INV001', message: '招待コードが無効です', statusCode: 400 }),
		);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useInvitationContext({ code: 'bad' }), { wrapper });

		await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
		expect((result.current.error as ApiError).code).toBe('INV001');
		expect(verifyInvitationContext).toHaveBeenCalledTimes(1);
	});
});

describe('useMyInvitations / useMyInvitationQuota', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('useMyInvitations が apiClient.getMyInvitations を呼んで配列を返す', async () => {
		const mock: InvitationWithShareUrlResponse[] = [
			{
				id: 'inv-1',
				code: 'k9x7m2j3pq',
				shareUrl: 'https://mosaku.jp/invite/k9x7m2j3pq',
				maxUses: 1,
				usedCount: 0,
				expiresAt: null,
				createdAt: '2026-05-24T00:00:00Z',
			},
		];
		getMyInvitations.mockResolvedValue(mock);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useMyInvitations(), { wrapper });

		await waitFor(() => expect(result.current.data).toEqual(mock));
	});

	it('useMyInvitationQuota が UserQuotaResponse を返す', async () => {
		const mock: UserQuotaResponse = { invitationQuota: 5, unlimited: false, role: 'USER' };
		getMyInvitationQuota.mockResolvedValue(mock);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useMyInvitationQuota(), { wrapper });

		await waitFor(() => expect(result.current.data).toEqual(mock));
	});
});

describe('useCreateMyInvitation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('成功時に invitations.myList と invitations.myQuota を invalidate する', async () => {
		const created: InvitationWithShareUrlResponse = {
			id: 'inv-1',
			code: 'k9x7m2j3pq',
			shareUrl: 'https://mosaku.jp/invite/k9x7m2j3pq',
			maxUses: 1,
			usedCount: 0,
			expiresAt: null,
			createdAt: '2026-05-24T00:00:00Z',
		};
		createMyInvitation.mockResolvedValue(created);
		const { wrapper, client } = makeWrapper();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
		const { result } = renderHook(() => useCreateMyInvitation(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(createMyInvitation).toHaveBeenCalledTimes(1);
		const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey?.[0]);
		expect(invalidatedKeys).toContain('invitations');
	});

	it('QUOTA_EXHAUSTED の ApiError をそのまま throw する', async () => {
		createMyInvitation.mockRejectedValue(
			new ApiError({ code: 'INV005', message: '招待枠を使い切りました', statusCode: 400 }),
		);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useCreateMyInvitation(), { wrapper });

		await expect(
			act(async () => {
				await result.current.mutateAsync();
			}),
		).rejects.toBeInstanceOf(ApiError);
	});
});

describe('useDeleteMyInvitation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('成功時に invitations.myList を invalidate する', async () => {
		deleteMyInvitation.mockResolvedValue(undefined);
		const { wrapper, client } = makeWrapper();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
		const { result } = renderHook(() => useDeleteMyInvitation(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: 'inv-1' });
		});

		expect(deleteMyInvitation).toHaveBeenCalledWith({ id: 'inv-1' });
		const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey?.[0]);
		expect(invalidatedKeys).toContain('invitations');
	});
});

describe('useStartOAuthRegistration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('指定 provider と invitationCode で apiClient.startOAuthRegistration を呼ぶ', async () => {
		startOAuthRegistration.mockResolvedValue({ authorizationUrl: 'https://google/auth' });
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useStartOAuthRegistration(), { wrapper });

		const response = await act(async () =>
			result.current.mutateAsync({ provider: 'google', invitationCode: 'k9x7m2j3pq' }),
		);

		expect(startOAuthRegistration).toHaveBeenCalledWith({
			provider: 'google',
			invitationCode: 'k9x7m2j3pq',
		});
		expect(response).toEqual({ authorizationUrl: 'https://google/auth' });
	});

	it('検証失敗時に ApiError をそのまま throw する（window.location.assign はコンポーネント責務）', async () => {
		startOAuthRegistration.mockRejectedValue(
			new ApiError({
				code: 'INV002',
				message: '招待コードの有効期限が切れています',
				statusCode: 400,
			}),
		);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useStartOAuthRegistration(), { wrapper });

		await expect(
			act(async () =>
				result.current.mutateAsync({ provider: 'github', invitationCode: 'expired' }),
			),
		).rejects.toBeInstanceOf(ApiError);
	});
});
