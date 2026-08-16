import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { ApiError } from '../utils/apiError';

const submitFeedbackMock = vi.fn();

vi.mock('../utils/api', () => ({
	apiClient: {
		submitFeedback: (...args: unknown[]) => submitFeedbackMock(...args),
	},
}));

import { useFeedbackQueries } from './useFeedbackQueries';

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

describe('useFeedbackQueries', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('submitFeedback が apiClient.submitFeedback を正しい引数で呼ぶ', async () => {
		submitFeedbackMock.mockResolvedValue(undefined);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useFeedbackQueries(), { wrapper });

		await act(async () => {
			await result.current.submitFeedback({ category: 'bug', message: 'テストバグです' });
		});

		expect(submitFeedbackMock).toHaveBeenCalledWith({
			category: 'bug',
			message: 'テストバグです',
		});
	});

	it('送信成功後に isSubmitting が false になる', async () => {
		submitFeedbackMock.mockResolvedValue(undefined);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useFeedbackQueries(), { wrapper });

		await act(async () => {
			await result.current.submitFeedback({ category: 'improvement', message: '改善案' });
		});

		await waitFor(() => {
			expect(result.current.isSubmitting).toBe(false);
		});
	});

	it('ApiError (429) がそのまま throw される', async () => {
		submitFeedbackMock.mockRejectedValue(
			new ApiError({ code: null, message: 'Too Many Requests', statusCode: 429 }),
		);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useFeedbackQueries(), { wrapper });

		await expect(
			act(async () => {
				await result.current.submitFeedback({ category: 'other', message: 'test' });
			}),
		).rejects.toBeInstanceOf(ApiError);
	});

	it('429 エラーの statusCode が 429 であることを呼び出し側で検出できる', async () => {
		const rateLimitError = new ApiError({
			code: null,
			message: 'Too Many Requests',
			statusCode: 429,
		});
		submitFeedbackMock.mockRejectedValue(rateLimitError);
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useFeedbackQueries(), { wrapper });

		let caughtError: unknown;
		await act(async () => {
			try {
				await result.current.submitFeedback({ category: 'bug', message: 'test' });
			} catch (e) {
				caughtError = e;
			}
		});

		expect(caughtError).toBeInstanceOf(ApiError);
		expect((caughtError as ApiError).statusCode).toBe(429);
	});

	it('初期状態で isSubmitting が false', () => {
		const { wrapper } = makeWrapper();
		const { result } = renderHook(() => useFeedbackQueries(), { wrapper });
		expect(result.current.isSubmitting).toBe(false);
	});
});
