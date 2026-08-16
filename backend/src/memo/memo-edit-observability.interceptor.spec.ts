import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
	MemoEditLogPayload,
	MemoEditObservabilityInterceptor,
} from './memo-edit-observability.interceptor';

/**
 * 編集経路観測 Interceptor のユニットテスト（Req 2.4）。
 *
 * - 編集経路の route が正規化された clean-label のみになること（高カーディナリティな id を漏らさない）。
 * - 固定キー `memo_edit_read` で `latency_ms` が発出されること。
 * - 公開キー `public_memo_read` と混線しない（発出源が物理的に分離されている）こと。
 */
describe('MemoEditObservabilityInterceptor', () => {
	const RAW_ID = '550e8400-e29b-41d4-a716-446655440000';

	let interceptor: MemoEditObservabilityInterceptor;
	let logSpy: jest.SpyInstance;

	beforeEach(() => {
		interceptor = new MemoEditObservabilityInterceptor();
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

	const successHandler = (value: unknown = { id: RAW_ID }): CallHandler => ({
		handle: () => of(value),
	});

	const errorHandler = (error: unknown): CallHandler => ({
		handle: () => throwError(() => error),
	});

	const emittedPayloads = (): MemoEditLogPayload[] =>
		logSpy.mock.calls.map(([line]) => JSON.parse(line as string) as MemoEditLogPayload);

	it('route が Express ルートパターンの clean-label に正規化され、生 id を payload に含めない', async () => {
		const context = createContext({
			method: 'PATCH',
			route: { path: '/memos/:id' },
			originalUrl: `/memos/${RAW_ID}`,
		});

		await lastValueFrom(interceptor.intercept(context, successHandler()));

		const [payload] = emittedPayloads();
		expect(payload.route).toBe('/memos/:id');
		// 生 id は route にもシリアライズ済み JSON 全体にも一切現れない（clean-label をコード側で担保）
		expect(JSON.stringify(payload)).not.toContain(RAW_ID);
	});

	it('固定キー memo_edit_read で latency_ms を発出し、公開キー public_memo_read と混線しない', async () => {
		const context = createContext({
			method: 'POST',
			route: { path: '/memos' },
		});

		await lastValueFrom(interceptor.intercept(context, successHandler()));

		const payloads = emittedPayloads();
		expect(payloads).toHaveLength(1);
		expect(payloads[0]).toMatchObject({
			message: 'memo_edit_read',
			feature_area: 'memo',
			method: 'POST',
			route: '/memos',
			status: 200,
			severity: 'INFO',
		});
		expect(payloads[0].message).not.toBe('public_memo_read');
		expect(typeof payloads[0].latency_ms).toBe('number');
		expect(payloads[0].latency_ms).toBeGreaterThanOrEqual(0);
	});

	it('ルートパターンが取れない場合は生 URL に退避せず安定フォールバックへ収束し id を漏らさない', async () => {
		const context = createContext({
			method: 'GET',
			originalUrl: `/memos/${RAW_ID}?foo=bar`,
		});

		await lastValueFrom(interceptor.intercept(context, successHandler()));

		const [payload] = emittedPayloads();
		// ルートパターン欠落時でも生 id を payload に漏らさない（clean-label をコード側で担保）
		expect(JSON.stringify(payload)).not.toContain(RAW_ID);
		expect(payload.route).toBe('/memos');
	});

	it('例外（4xx）時に 1 件発出し、HttpException の status を確定する', async () => {
		const context = createContext({
			method: 'DELETE',
			route: { path: '/memos/:id' },
		});

		await expect(
			lastValueFrom(interceptor.intercept(context, errorHandler(new ForbiddenException()))),
		).rejects.toBeInstanceOf(ForbiddenException);

		const payloads = emittedPayloads();
		expect(payloads).toHaveLength(1);
		expect(payloads[0]).toMatchObject({
			message: 'memo_edit_read',
			route: '/memos/:id',
			status: 403,
			severity: 'INFO',
		});
	});

	it('予期せぬ例外（5xx）時に ERROR で 1 件発出し status=500 を確定する', async () => {
		const context = createContext({
			method: 'POST',
			route: { path: '/memos' },
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
			method: 'PATCH',
			route: { path: '/memos/:id' },
		});

		await expect(
			lastValueFrom(interceptor.intercept(context, successHandler({ id: RAW_ID }))),
		).resolves.toEqual({ id: RAW_ID });
	});
});
