import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { useSentryRouteTag } from './useSentryRouteTag';

const setTagMock = vi.fn();

vi.mock('@sentry/react', () => ({
	getCurrentScope: () => ({ setTag: setTagMock }),
}));

function makeWrapper(initialEntries: string[]) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return createElement(MemoryRouter, { initialEntries }, children);
	};
}

describe('useSentryRouteTag', () => {
	beforeEach(() => {
		setTagMock.mockClear();
	});

	it('マウント時に現在の pathname を route タグに反映すること', () => {
		renderHook(() => useSentryRouteTag(), {
			wrapper: makeWrapper(['/memo/1']),
		});

		expect(setTagMock).toHaveBeenCalledWith('route', '/memo/1');
	});

	it('2 回の route 遷移で setTag が遷移ごとに呼ばれること', () => {
		const { result } = renderHook(
			() => {
				useSentryRouteTag();
				return useNavigate();
			},
			{ wrapper: makeWrapper(['/memo/1']) },
		);

		setTagMock.mockClear();

		act(() => {
			result.current('/notebook/2');
		});
		act(() => {
			result.current('/auth/login');
		});

		expect(setTagMock).toHaveBeenCalledTimes(2);
		expect(setTagMock).toHaveBeenNthCalledWith(1, 'route', '/notebook/2');
		expect(setTagMock).toHaveBeenNthCalledWith(2, 'route', '/auth/login');
	});

	it('同じ pathname に再 render しても重複して setTag を呼ばないこと', () => {
		const { rerender } = renderHook(() => useSentryRouteTag(), {
			wrapper: makeWrapper(['/memo/1']),
		});

		setTagMock.mockClear();

		rerender();

		expect(setTagMock).not.toHaveBeenCalled();
	});
});
