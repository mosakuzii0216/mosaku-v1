import { CallHandler, ExecutionContext, NotFoundException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
	PublicReadLogPayload,
	PublicReadObservabilityInterceptor,
} from './public-read-observability.interceptor';

/**
 * 公開読み取り観測 Interceptor のユニットテスト（Req 1.1 / 1.3 / 6.3）。
 *
 * - route が `:token` 正規化された値のみになること（生トークン非出力の不変条件）。
 * - 200 / 404 / 例外それぞれで構造化ログが 1 件発出され、status / severity / latency_ms が正しいこと。
 */
describe('PublicReadObservabilityInterceptor', () => {
	const RAW_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789';

	let interceptor: PublicReadObservabilityInterceptor;
	let logSpy: jest.SpyInstance;

	beforeEach(() => {
		interceptor = new PublicReadObservabilityInterceptor();
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const createContext = (
		request: Record<string, unknown>,
		response: Record<string, unknown> = { statusCode: 200 },
	): ExecutionContext =>
		({
			switchToHttp: () => ({
				getRequest: () => request,
				getResponse: () => response,
			}),
		}) as unknown as ExecutionContext;

	const successHandler = (value: unknown = { title: 't' }): CallHandler => ({
		handle: () => of(value),
	});

	const errorHandler = (error: unknown): CallHandler => ({
		handle: () => throwError(() => error),
	});

	const emittedPayloads = (): PublicReadLogPayload[] =>
		logSpy.mock.calls.map(([line]) => JSON.parse(line as string) as PublicReadLogPayload);

	it('route が :token 正規化された値のみになり、生トークンを payload に含めない', async () => {
		const context = createContext({
			method: 'GET',
			url: `/memos/public/${RAW_TOKEN}?foo=bar`,
			originalUrl: `/memos/public/${RAW_TOKEN}?foo=bar`,
		});

		await lastValueFrom(interceptor.intercept(context, successHandler()));

		const [payload] = emittedPayloads();
		expect(payload.route).toBe('/memos/public/:token');
		// 生トークンは route にもシリアライズ済み JSON 全体にも一切現れない
		expect(JSON.stringify(payload)).not.toContain(RAW_TOKEN);
	});

	it('成功時（200）に INFO で 1 件発出し、固定キーと feature_area を満たす', async () => {
		const context = createContext({
			method: 'GET',
			url: `/memos/public/${RAW_TOKEN}`,
		});

		await lastValueFrom(interceptor.intercept(context, successHandler()));

		const payloads = emittedPayloads();
		expect(payloads).toHaveLength(1);
		expect(payloads[0]).toMatchObject({
			message: 'public_memo_read',
			feature_area: 'memo',
			method: 'GET',
			status: 200,
			severity: 'INFO',
		});
		expect(typeof payloads[0].latency_ms).toBe('number');
		expect(payloads[0].latency_ms).toBeGreaterThanOrEqual(0);
	});

	it('404（NotFoundException）時に INFO で 1 件発出し status=404 を確定する', async () => {
		const context = createContext({
			method: 'GET',
			url: `/memos/public/${RAW_TOKEN}`,
		});

		await expect(
			lastValueFrom(interceptor.intercept(context, errorHandler(new NotFoundException()))),
		).rejects.toBeInstanceOf(NotFoundException);

		const payloads = emittedPayloads();
		expect(payloads).toHaveLength(1);
		expect(payloads[0]).toMatchObject({
			message: 'public_memo_read',
			route: '/memos/public/:token',
			status: 404,
			severity: 'INFO',
		});
	});

	it('予期せぬ例外（5xx）時に ERROR で 1 件発出し status=500 を確定する', async () => {
		const context = createContext({
			method: 'GET',
			url: `/memos/public/${RAW_TOKEN}`,
		});

		await expect(
			lastValueFrom(interceptor.intercept(context, errorHandler(new Error('boom')))),
		).rejects.toThrow('boom');

		const payloads = emittedPayloads();
		expect(payloads).toHaveLength(1);
		expect(payloads[0]).toMatchObject({
			status: 500,
			severity: 'ERROR',
		});
	});

	it('ログ発出が失敗してもリクエスト処理を中断しない（observability は correctness を妨げない）', async () => {
		logSpy.mockImplementation(() => {
			throw new Error('logging sink down');
		});
		const context = createContext({
			method: 'GET',
			url: `/memos/public/${RAW_TOKEN}`,
		});

		await expect(
			lastValueFrom(interceptor.intercept(context, successHandler({ title: 'ok' }))),
		).resolves.toEqual({ title: 'ok' });
	});
});
