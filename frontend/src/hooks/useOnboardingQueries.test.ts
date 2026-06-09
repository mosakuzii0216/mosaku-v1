import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

const completeOnboardingMock = vi.fn();
const skipOnboardingMock = vi.fn();

vi.mock('../utils/api', () => ({
	apiClient: {
		completeOnboarding: (...args: unknown[]) => completeOnboardingMock(...args),
		skipOnboarding: (...args: unknown[]) => skipOnboardingMock(...args),
	},
}));

const refreshUserMock = vi.fn();
const closeMock = vi.fn();
const goToMemosForNotebookMock = vi.fn();
const withScopeMock = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
	useAuth: () => ({
		user: { id: 'user-123', email: 'test@example.com' },
		refreshUser: refreshUserMock,
	}),
}));

vi.mock('../stores/useOnboardingStore', () => ({
	useOnboardingStore: () => ({
		close: closeMock,
	}),
}));

vi.mock('../stores/useViewStore', () => ({
	useViewStore: () => ({
		goToMemosForNotebook: goToMemosForNotebookMock,
	}),
}));

vi.mock('@sentry/react', () => ({
	withScope: (...args: unknown[]) => withScopeMock(...args),
	captureException: vi.fn(),
}));

import { useCompleteOnboarding, useSkipOnboarding } from './useOnboardingQueries';

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

describe('useCompleteOnboarding', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('初期状態で isPending が false', () => {
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });
		expect(result.current.isPending).toBe(false);
	});

	it('成功時に refreshUser → invalidateQueries → goToMemosForNotebook → close が呼ばれる', async () => {
		const mockResponse = { notebookId: 'nb-1', memoIds: ['memo-1', 'memo-2'] };
		completeOnboardingMock.mockResolvedValue(mockResponse);
		refreshUserMock.mockResolvedValue(undefined);

		const { wrapper, client } = makeWrapper();
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
		const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

		await act(async () => {
			result.current.completeOnboarding('theme-abc');
		});

		await waitFor(() => {
			expect(refreshUserMock).toHaveBeenCalledOnce();
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notebooks'] });
			expect(goToMemosForNotebookMock).toHaveBeenCalledWith('nb-1');
			expect(closeMock).toHaveBeenCalledOnce();
		});
	});

	it('成功時に apiClient.completeOnboarding が themeId を引数で呼ばれる', async () => {
		completeOnboardingMock.mockResolvedValue({ notebookId: 'nb-1', memoIds: [] });
		refreshUserMock.mockResolvedValue(undefined);

		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

		await act(async () => {
			result.current.completeOnboarding('theme-xyz');
		});

		await waitFor(() => {
			expect(completeOnboardingMock).toHaveBeenCalledWith('theme-xyz');
		});
	});

	it('エラー時に withScope が呼ばれ close が実行される', async () => {
		completeOnboardingMock.mockRejectedValue(new Error('作成失敗'));

		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

		await act(async () => {
			result.current.completeOnboarding('theme-bad');
		});

		await waitFor(() => {
			expect(withScopeMock).toHaveBeenCalledOnce();
			expect(closeMock).toHaveBeenCalledOnce();
		});
	});

	it('エラー時に refreshUser は呼ばれない', async () => {
		completeOnboardingMock.mockRejectedValue(new Error('作成失敗'));

		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

		await act(async () => {
			result.current.completeOnboarding('theme-bad');
		});

		await waitFor(() => {
			expect(refreshUserMock).not.toHaveBeenCalled();
		});
	});
});

describe('useSkipOnboarding', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('初期状態で isPending が false', () => {
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useSkipOnboarding(), { wrapper });
		expect(result.current.isPending).toBe(false);
	});

	it('成功時に refreshUser → close が呼ばれる', async () => {
		skipOnboardingMock.mockResolvedValue({ message: 'skipped' });
		refreshUserMock.mockResolvedValue(undefined);

		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useSkipOnboarding(), { wrapper });

		await act(async () => {
			result.current.skipOnboarding();
		});

		await waitFor(() => {
			expect(refreshUserMock).toHaveBeenCalledOnce();
			expect(closeMock).toHaveBeenCalledOnce();
		});
	});

	it('成功時に apiClient.skipOnboarding が呼ばれる', async () => {
		skipOnboardingMock.mockResolvedValue({ message: 'skipped' });
		refreshUserMock.mockResolvedValue(undefined);

		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useSkipOnboarding(), { wrapper });

		await act(async () => {
			result.current.skipOnboarding();
		});

		await waitFor(() => {
			expect(skipOnboardingMock).toHaveBeenCalledOnce();
		});
	});

	it('エラー時に withScope が呼ばれ close が実行される', async () => {
		skipOnboardingMock.mockRejectedValue(new Error('スキップ失敗'));

		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useSkipOnboarding(), { wrapper });

		await act(async () => {
			result.current.skipOnboarding();
		});

		await waitFor(() => {
			expect(withScopeMock).toHaveBeenCalledOnce();
			expect(closeMock).toHaveBeenCalledOnce();
		});
	});
});
