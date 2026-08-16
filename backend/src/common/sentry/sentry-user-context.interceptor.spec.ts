import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';

const setUserMock = jest.fn<void, [{ id: string }]>();
const getCurrentScopeMock = jest.fn(() => ({ setUser: setUserMock }));

jest.mock('@sentry/nestjs', () => ({
	getCurrentScope: () => getCurrentScopeMock(),
}));

import { SentryUserContextInterceptor } from './sentry-user-context.interceptor';

describe('SentryUserContextInterceptor', () => {
	let interceptor: SentryUserContextInterceptor;

	const createMockContext = (user?: Record<string, unknown>): ExecutionContext =>
		({
			switchToHttp: () => ({
				getRequest: () => ({ user }),
			}),
		}) as unknown as ExecutionContext;

	const createMockHandler = (): CallHandler => ({
		handle: () => of('next-result'),
	});

	beforeEach(() => {
		setUserMock.mockClear();
		getCurrentScopeMock.mockClear();
		interceptor = new SentryUserContextInterceptor();
	});

	it('should be defined', () => {
		expect(interceptor).toBeDefined();
	});

	it('認証済みユーザーがいる場合に Sentry scope に { id } のみを設定すること', async () => {
		const context = createMockContext({ id: 'user-123' });
		const handler = createMockHandler();

		const result$ = interceptor.intercept(context, handler);
		await lastValueFrom(result$);

		expect(setUserMock).toHaveBeenCalledTimes(1);
		expect(setUserMock).toHaveBeenCalledWith({ id: 'user-123' });
	});

	it('email / username / OAuth provider / IP を絶対に渡さないこと', async () => {
		const context = createMockContext({
			id: 'user-123',
			email: 'leak@example.com',
			username: 'leakName',
			provider: 'google',
			ipAddress: '203.0.113.5',
		});
		const handler = createMockHandler();

		await lastValueFrom(interceptor.intercept(context, handler));

		expect(setUserMock).toHaveBeenCalledTimes(1);
		const arg = setUserMock.mock.calls[0][0];
		expect(arg).toEqual({ id: 'user-123' });
		expect(Object.keys(arg)).toEqual(['id']);
	});

	it('req.user が undefined の場合に setUser を呼ばないこと（公開ルート想定）', async () => {
		const context = createMockContext(undefined);
		const handler = createMockHandler();

		await lastValueFrom(interceptor.intercept(context, handler));

		expect(setUserMock).not.toHaveBeenCalled();
	});

	it('req.user.id が文字列でない場合に setUser を呼ばないこと', async () => {
		const context = createMockContext({ id: 12345 as unknown as string });
		const handler = createMockHandler();

		await lastValueFrom(interceptor.intercept(context, handler));

		expect(setUserMock).not.toHaveBeenCalled();
	});

	it('req.user.id が空文字の場合に setUser を呼ばないこと', async () => {
		const context = createMockContext({ id: '' });
		const handler = createMockHandler();

		await lastValueFrom(interceptor.intercept(context, handler));

		expect(setUserMock).not.toHaveBeenCalled();
	});

	it('next.handle() の戻り値をそのまま伝搬すること', async () => {
		const context = createMockContext({ id: 'user-123' });
		const handler = createMockHandler();

		const result = await lastValueFrom(interceptor.intercept(context, handler));

		expect(result).toBe('next-result');
	});

	it('HTTP コンテキスト以外（例: WebSocket）では setUser を呼ばないこと', async () => {
		const context = {
			switchToHttp: () => ({
				getRequest: () => undefined,
			}),
		} as unknown as ExecutionContext;
		const handler = createMockHandler();

		await lastValueFrom(interceptor.intercept(context, handler));

		expect(setUserMock).not.toHaveBeenCalled();
	});
});
