import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { ConfigService, type RefreshCookieOptions } from '../config/config.service';
import { REFRESH_COOKIE_NAME } from '../config/auth-constants';

describe('RefreshCookieHelper', () => {
	let helper: RefreshCookieHelper;

	const buildRes = (): Pick<Response, 'cookie' | 'clearCookie'> => ({
		cookie: jest.fn(),
		clearCookie: jest.fn(),
	});

	const buildHelperWith = async (options: RefreshCookieOptions): Promise<RefreshCookieHelper> => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RefreshCookieHelper,
				{ provide: ConfigService, useValue: { refreshCookieOptions: options } },
			],
		}).compile();
		return module.get(RefreshCookieHelper);
	};

	describe('setRefreshCookie', () => {
		it('Production の Lax/Secure で正しい Cookie 属性を組み立てる', async () => {
			helper = await buildHelperWith({
				sameSite: 'lax',
				secure: true,
				path: '/auth',
				domain: '.mosaku.jp',
			});
			const res = buildRes();
			const expiresAt = new Date('2030-01-01T00:00:00.000Z');

			helper.setRefreshCookie(res as Response, 'plain-rt-string', expiresAt);

			expect(res.cookie).toHaveBeenCalledTimes(1);
			expect(res.cookie).toHaveBeenCalledWith(
				REFRESH_COOKIE_NAME,
				'plain-rt-string',
				expect.objectContaining({
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					path: '/auth',
					domain: '.mosaku.jp',
					expires: expiresAt,
				}),
			);
		});

		it('domain 未指定なら domain は付与しない', async () => {
			helper = await buildHelperWith({
				sameSite: 'lax',
				secure: false,
				path: '/auth',
			});
			const res = buildRes();

			helper.setRefreshCookie(res as Response, 'plain', new Date('2030-01-01T00:00:00.000Z'));

			const callArg = (res.cookie as jest.Mock).mock.calls[0][2];
			expect(callArg.domain).toBeUndefined();
		});

		it('SameSite=none かつ secure=true を env で切替可能', async () => {
			helper = await buildHelperWith({
				sameSite: 'none',
				secure: true,
				path: '/auth',
				domain: undefined,
			});
			const res = buildRes();

			helper.setRefreshCookie(res as Response, 'plain', new Date('2030-01-01T00:00:00.000Z'));

			const callArg = (res.cookie as jest.Mock).mock.calls[0][2];
			expect(callArg.sameSite).toBe('none');
			expect(callArg.secure).toBe(true);
		});

		it('plain Refresh Token は引数として渡るが他には漏れない（HttpOnly 必須）', async () => {
			helper = await buildHelperWith({
				sameSite: 'lax',
				secure: false,
				path: '/auth',
			});
			const res = buildRes();

			helper.setRefreshCookie(
				res as Response,
				'sensitive-rt',
				new Date('2030-01-01T00:00:00.000Z'),
			);

			const callArg = (res.cookie as jest.Mock).mock.calls[0][2];
			expect(callArg.httpOnly).toBe(true);
		});
	});

	describe('clearRefreshCookie', () => {
		it('Cookie を Max-Age=0 で削除指示する', async () => {
			helper = await buildHelperWith({
				sameSite: 'lax',
				secure: true,
				path: '/auth',
				domain: '.mosaku.jp',
			});
			const res = buildRes();

			helper.clearRefreshCookie(res as Response);

			expect(res.clearCookie).toHaveBeenCalledTimes(1);
			expect(res.clearCookie).toHaveBeenCalledWith(
				REFRESH_COOKIE_NAME,
				expect.objectContaining({
					path: '/auth',
					domain: '.mosaku.jp',
					sameSite: 'lax',
					secure: true,
					httpOnly: true,
				}),
			);
		});

		it('domain 未指定なら clearCookie でも domain を付けない', async () => {
			helper = await buildHelperWith({
				sameSite: 'lax',
				secure: false,
				path: '/auth',
			});
			const res = buildRes();

			helper.clearRefreshCookie(res as Response);

			const callArg = (res.clearCookie as jest.Mock).mock.calls[0][1];
			expect(callArg.domain).toBeUndefined();
		});
	});
});
