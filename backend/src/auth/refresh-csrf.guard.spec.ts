import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { RefreshCsrfGuard } from './refresh-csrf.guard';
import { ConfigService } from '../config/config.service';
import { AppException } from '../common/exceptions';

describe('RefreshCsrfGuard', () => {
	let guard: RefreshCsrfGuard;
	const corsOrigins = ['https://mosaku.jp', 'http://localhost:5173'];

	const buildContext = (headers: Record<string, string | undefined>): ExecutionContext => {
		return {
			switchToHttp: () => ({
				getRequest: () => ({ headers }),
				getResponse: jest.fn(),
				getNext: jest.fn(),
			}),
			getClass: jest.fn(),
			getHandler: jest.fn(),
			getArgs: jest.fn(),
			getArgByIndex: jest.fn(),
			switchToRpc: jest.fn(),
			switchToWs: jest.fn(),
			getType: () => 'http',
		} as unknown as ExecutionContext;
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [RefreshCsrfGuard, { provide: ConfigService, useValue: { corsOrigins } }],
		}).compile();
		guard = module.get(RefreshCsrfGuard);
	});

	it('Origin が許可リスト内かつ X-Refresh-Request: 1 が付与されていれば通過する', () => {
		const ctx = buildContext({
			origin: 'https://mosaku.jp',
			'x-refresh-request': '1',
		});

		expect(guard.canActivate(ctx)).toBe(true);
	});

	it('Origin が許可リストに無いと AppException(403) を投げる', () => {
		const ctx = buildContext({
			origin: 'https://attacker.example',
			'x-refresh-request': '1',
		});

		expect.assertions(2);
		try {
			guard.canActivate(ctx);
		} catch (err) {
			expect(err).toBeInstanceOf(AppException);
			expect((err as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
		}
	});

	it('Origin ヘッダ自体が欠如していれば 403', () => {
		const ctx = buildContext({
			'x-refresh-request': '1',
		});

		expect.assertions(1);
		try {
			guard.canActivate(ctx);
		} catch (err) {
			expect((err as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
		}
	});

	it('X-Refresh-Request ヘッダ欠如で 403', () => {
		const ctx = buildContext({
			origin: 'https://mosaku.jp',
		});

		expect.assertions(1);
		try {
			guard.canActivate(ctx);
		} catch (err) {
			expect((err as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
		}
	});

	it('X-Refresh-Request の値が 1 以外なら 403', () => {
		const ctx = buildContext({
			origin: 'https://mosaku.jp',
			'x-refresh-request': '0',
		});

		expect.assertions(1);
		try {
			guard.canActivate(ctx);
		} catch (err) {
			expect((err as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
		}
	});

	it('localhost dev Origin も corsOrigins から正常許可される', () => {
		const ctx = buildContext({
			origin: 'http://localhost:5173',
			'x-refresh-request': '1',
		});

		expect(guard.canActivate(ctx)).toBe(true);
	});
});
