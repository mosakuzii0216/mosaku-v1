import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { RefreshTokenService } from './refresh-token.service';
import {
	RefreshTokenRepository,
	type RefreshTokenCreateInput,
	type RefreshTokenRecord,
} from './refresh-token.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { ERROR_CODES } from '../common/exceptions';
import { AppException } from '../common/exceptions/app.exception';

jest.mock('@sentry/nestjs', () => ({
	captureMessage: jest.fn(),
}));

type CreateMock = jest.Mock<Promise<RefreshTokenRecord>, [RefreshTokenCreateInput, ...unknown[]]>;
type CaptureMessageMock = jest.Mock<string, [string, unknown?]>;

describe('RefreshTokenService', () => {
	let service: RefreshTokenService;

	const repo = {
		create: jest.fn(),
		findByHash: jest.fn(),
		markRotated: jest.fn(),
		revoke: jest.fn(),
		revokeByFamily: jest.fn(),
		revokeAllForUser: jest.fn(),
	};

	const prisma = {
		$transaction: jest.fn((cb: (tx: unknown) => unknown) => cb('tx-client')),
	};

	const config = {
		refreshTokenPepper: 'test-pepper',
	};

	const baseRecord: RefreshTokenRecord = {
		id: 'rt-old',
		userId: 'user-1',
		tokenHash: 'irrelevant',
		familyId: 'fam-1',
		status: 'active',
		issuedAt: new Date('2026-01-01T00:00:00Z'),
		expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		lastUsedAt: null,
		ip: '10.0.0.1',
		userAgent: 'ua',
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RefreshTokenService,
				{ provide: RefreshTokenRepository, useValue: repo },
				{ provide: PrismaService, useValue: prisma },
				{ provide: ConfigService, useValue: config },
			],
		}).compile();

		service = module.get<RefreshTokenService>(RefreshTokenService);
		jest.clearAllMocks();
		prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb('tx-client'));
	});

	describe('issue', () => {
		it('plainRt は base64url、tokenHash は HMAC-SHA256 の 64 hex で DB に保存される', async () => {
			repo.create.mockResolvedValue({ ...baseRecord });

			const result = await service.issue({
				userId: 'user-1',
				ip: '127.0.0.1',
				userAgent: 'jest',
			});

			expect(result.plainRt).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(result.plainRt.length).toBeGreaterThanOrEqual(40);
			expect(repo.create).toHaveBeenCalledTimes(1);
			const callArg = (repo.create as unknown as CreateMock).mock.calls[0][0];
			expect(callArg.userId).toBe('user-1');
			expect(callArg.status).toBe('active');
			expect(callArg.ip).toBe('127.0.0.1');
			expect(callArg.userAgent).toBe('jest');
			expect(callArg.tokenHash).toMatch(/^[a-f0-9]{64}$/);
			expect(callArg.expiresAt.getTime()).toBeGreaterThan(callArg.issuedAt.getTime());
		});

		it('familyId 未指定なら都度新規 UUID v4 を採番する', async () => {
			repo.create.mockResolvedValue({ ...baseRecord });
			await service.issue({ userId: 'u', ip: null, userAgent: null });
			await service.issue({ userId: 'u', ip: null, userAgent: null });
			const createMock = repo.create as unknown as CreateMock;
			const f1 = createMock.mock.calls[0][0].familyId;
			const f2 = createMock.mock.calls[1][0].familyId;
			expect(f1).toMatch(/^[0-9a-f-]{36}$/);
			expect(f2).toMatch(/^[0-9a-f-]{36}$/);
			expect(f1).not.toBe(f2);
		});

		it('familyId を渡せば継承する（rotate 経路向け）', async () => {
			repo.create.mockResolvedValue({ ...baseRecord });
			await service.issue({
				userId: 'u',
				ip: null,
				userAgent: null,
				familyId: 'inherit-family',
			});
			expect((repo.create as unknown as CreateMock).mock.calls[0][0].familyId).toBe(
				'inherit-family',
			);
		});

		it('DB 書き込み失敗時に例外を伝播し、AT のみ返るような中途半端を作らない', async () => {
			repo.create.mockRejectedValue(new Error('db down'));
			await expect(service.issue({ userId: 'u', ip: null, userAgent: null })).rejects.toThrow(
				'db down',
			);
		});

		it('Sentry に refresh_token_issued を info で送出する', async () => {
			repo.create.mockResolvedValue({ ...baseRecord });
			await service.issue({ userId: 'u', ip: null, userAgent: null });
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'refresh_token_issued',
				expect.objectContaining({
					level: 'info',
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					tags: expect.objectContaining({ feature_area: 'auth' }),
				}),
			);
		});

		it('DB 書き込み失敗時に refresh_token_issue_failed を error で送出する', async () => {
			repo.create.mockRejectedValue(new Error('db down'));

			await expect(service.issue({ userId: 'u', ip: null, userAgent: null })).rejects.toThrow(
				'db down',
			);

			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'refresh_token_issue_failed',
				expect.objectContaining({
					level: 'error',
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					tags: expect.objectContaining({ feature_area: 'auth' }),
				}),
			);
		});

		it('issue 失敗時に refresh_token_issued は送出されない', async () => {
			repo.create.mockRejectedValue(new Error('db down'));

			await expect(service.issue({ userId: 'u', ip: null, userAgent: null })).rejects.toThrow();

			const calls = (Sentry.captureMessage as unknown as CaptureMessageMock).mock.calls.map(
				(c) => c[0],
			);
			expect(calls).not.toContain('refresh_token_issued');
		});
	});

	describe('rotate', () => {
		it('active な RT を渡すと markRotated → create を同一トランザクションで実行する', async () => {
			repo.findByHash.mockResolvedValue({ ...baseRecord });
			repo.markRotated.mockResolvedValue({ ...baseRecord, status: 'rotated' });
			repo.create.mockResolvedValue({ ...baseRecord, id: 'rt-new' });

			const result = await service.rotate({
				plainRt: 'some-plain',
				ip: '10.0.0.2',
				userAgent: 'new-ua',
			});

			expect(prisma.$transaction).toHaveBeenCalledTimes(1);
			expect(repo.markRotated).toHaveBeenCalledWith('rt-old', expect.any(Date), 'tx-client');
			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					familyId: 'fam-1',
					status: 'active',
					ip: '10.0.0.2',
					userAgent: 'new-ua',
				}),
				'tx-client',
			);
			expect(result.userId).toBe('user-1');
			expect(result.familyId).toBe('fam-1');
			expect(result.plainRt.length).toBeGreaterThanOrEqual(40);
		});

		it('レコード不存在は AUTH010 を投げる', async () => {
			repo.findByHash.mockResolvedValue(null);
			await expect(
				service.rotate({ plainRt: 'x', ip: null, userAgent: null }),
			).rejects.toBeInstanceOf(AppException);
			await expect(
				service.rotate({ plainRt: 'x', ip: null, userAgent: null }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID });
		});

		it('status=revoked は AUTH011 を投げる', async () => {
			repo.findByHash.mockResolvedValue({ ...baseRecord, status: 'revoked' });
			await expect(
				service.rotate({ plainRt: 'x', ip: null, userAgent: null }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.REFRESH_TOKEN_REVOKED });
		});

		it('expiresAt < now は AUTH013 を投げる', async () => {
			repo.findByHash.mockResolvedValue({
				...baseRecord,
				expiresAt: new Date(Date.now() - 1000),
			});
			await expect(
				service.rotate({ plainRt: 'x', ip: null, userAgent: null }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.REFRESH_TOKEN_EXPIRED });
		});

		it('status=rotated 再使用で family 全 revoke + Sentry warning + AUTH012', async () => {
			repo.findByHash.mockResolvedValue({ ...baseRecord, status: 'rotated' });
			repo.revokeByFamily.mockResolvedValue(3);

			await expect(
				service.rotate({ plainRt: 'x', ip: null, userAgent: null }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.REFRESH_TOKEN_REUSED });

			expect(repo.revokeByFamily).toHaveBeenCalledWith('fam-1', undefined);
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'refresh_token_reuse_detected',
				expect.objectContaining({
					level: 'warning',
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					tags: expect.objectContaining({ feature_area: 'auth' }),
				}),
			);
		});

		it('markRotated が null（並行 rotate の lost update）でも family revoke + AUTH012', async () => {
			repo.findByHash.mockResolvedValue({ ...baseRecord });
			repo.markRotated.mockResolvedValue(null);
			repo.revokeByFamily.mockResolvedValue(2);

			await expect(
				service.rotate({ plainRt: 'x', ip: null, userAgent: null }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.REFRESH_TOKEN_REUSED });

			expect(repo.revokeByFamily).toHaveBeenCalledWith('fam-1', 'tx-client');
		});

		it('Sentry に refresh_token_rotated を info で送出する', async () => {
			repo.findByHash.mockResolvedValue({ ...baseRecord });
			repo.markRotated.mockResolvedValue({ ...baseRecord, status: 'rotated' });
			repo.create.mockResolvedValue({ ...baseRecord, id: 'rt-new' });

			await service.rotate({ plainRt: 'x', ip: null, userAgent: null });

			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'refresh_token_rotated',
				expect.objectContaining({
					level: 'info',
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					tags: expect.objectContaining({ feature_area: 'auth' }),
				}),
			);
		});
	});

	describe('revoke', () => {
		it('plain RT に対応するレコードのみを revoke し、family 全体には波及させない', async () => {
			repo.findByHash.mockResolvedValue({ ...baseRecord });
			repo.revoke.mockResolvedValue({ ...baseRecord, status: 'revoked' });

			await service.revoke('plain-rt');

			expect(repo.revoke).toHaveBeenCalledWith('rt-old');
			expect(repo.revokeByFamily).not.toHaveBeenCalled();
		});

		it('レコード不存在は黙って成功（多重ログアウト耐性）', async () => {
			repo.findByHash.mockResolvedValue(null);
			await expect(service.revoke('missing')).resolves.toBeUndefined();
			expect(repo.revoke).not.toHaveBeenCalled();
		});

		it('成功時に Sentry へ refresh_token_revoked (reason: logout) を送出', async () => {
			repo.findByHash.mockResolvedValue({ ...baseRecord });
			repo.revoke.mockResolvedValue({ ...baseRecord, status: 'revoked' });

			await service.revoke('plain-rt');

			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'refresh_token_revoked',
				expect.objectContaining({
					level: 'info',
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					tags: expect.objectContaining({ feature_area: 'auth', reason: 'logout' }),
				}),
			);
		});

		it('再使用検知のため revoke 後の再 rotate は AUTH011 へ繋がる契約（独立的に確認）', async () => {
			// revoke 後の rotate は status=revoked の record を読むのでこのスペックは
			// rotate の status=revoked 分岐で担保される（重複検証）
			repo.findByHash.mockResolvedValue({ ...baseRecord, status: 'revoked' });
			await expect(
				service.rotate({ plainRt: 'x', ip: null, userAgent: null }),
			).rejects.toMatchObject({ code: ERROR_CODES.AUTH.REFRESH_TOKEN_REVOKED });
		});
	});

	describe('revokeAllForUser', () => {
		it('ユーザーの全 RT を revoke し件数を返す', async () => {
			repo.revokeAllForUser.mockResolvedValue(4);
			const count = await service.revokeAllForUser('user-1', 'password_change');

			expect(count).toBe(4);
			expect(repo.revokeAllForUser).toHaveBeenCalledWith('user-1');
		});

		it('Sentry に refresh_token_revoked (reason 同梱 + count extra) を送出する', async () => {
			repo.revokeAllForUser.mockResolvedValue(2);
			await service.revokeAllForUser('user-1', 'password_change');

			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'refresh_token_revoked',
				expect.objectContaining({
					level: 'info',
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					tags: expect.objectContaining({
						feature_area: 'auth',
						reason: 'password_change',
					}),
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					extra: expect.objectContaining({ count: 2 }),
				}),
			);
		});

		it('reason: admin 経路も同じ形で送出する', async () => {
			repo.revokeAllForUser.mockResolvedValue(1);
			await service.revokeAllForUser('user-1', 'admin');

			expect(Sentry.captureMessage).toHaveBeenLastCalledWith(
				'refresh_token_revoked',
				expect.objectContaining({
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					tags: expect.objectContaining({ reason: 'admin' }),
				}),
			);
		});
	});
});
