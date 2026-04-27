import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSentryAuthSync } from './useSentryAuthSync';

const setUserMock = vi.fn();

vi.mock('@sentry/react', () => ({
	setUser: (user: unknown) => setUserMock(user),
}));

describe('useSentryAuthSync', () => {
	beforeEach(() => {
		setUserMock.mockClear();
	});

	it('user が null の場合 Sentry.setUser(null) を呼ぶこと', () => {
		renderHook(() => useSentryAuthSync(null));

		expect(setUserMock).toHaveBeenCalledTimes(1);
		expect(setUserMock).toHaveBeenCalledWith(null);
	});

	it('user に id がある場合 Sentry.setUser({ id }) を呼ぶこと', () => {
		renderHook(() => useSentryAuthSync({ id: 'user-123' }));

		expect(setUserMock).toHaveBeenCalledTimes(1);
		expect(setUserMock).toHaveBeenCalledWith({ id: 'user-123' });
	});

	it('email / username / provider など PII を絶対に Sentry に渡さないこと', () => {
		renderHook(() =>
			useSentryAuthSync({
				id: 'user-456',
				email: 'user@example.com',
				name: 'Display Name',
				provider: 'google',
			}),
		);

		expect(setUserMock).toHaveBeenCalledTimes(1);
		expect(setUserMock).toHaveBeenCalledWith({ id: 'user-456' });
		const argument = setUserMock.mock.calls[0][0];
		expect(argument).not.toHaveProperty('email');
		expect(argument).not.toHaveProperty('name');
		expect(argument).not.toHaveProperty('provider');
		expect(argument).not.toHaveProperty('username');
		expect(argument).not.toHaveProperty('ip_address');
	});

	it('login → logout のフローで id → null の順に呼ばれること', () => {
		const { rerender } = renderHook(({ user }) => useSentryAuthSync(user), {
			initialProps: { user: null as { id: string } | null },
		});

		setUserMock.mockClear();

		rerender({ user: { id: 'user-789' } });
		rerender({ user: null });

		expect(setUserMock).toHaveBeenCalledTimes(2);
		expect(setUserMock).toHaveBeenNthCalledWith(1, { id: 'user-789' });
		expect(setUserMock).toHaveBeenNthCalledWith(2, null);
	});

	it('同じ id で再レンダリングしても重複して setUser を呼ばないこと', () => {
		const user = { id: 'user-stable' };
		const { rerender } = renderHook(({ u }) => useSentryAuthSync(u), {
			initialProps: { u: user },
		});

		setUserMock.mockClear();

		rerender({ u: user });

		expect(setUserMock).not.toHaveBeenCalled();
	});
});
