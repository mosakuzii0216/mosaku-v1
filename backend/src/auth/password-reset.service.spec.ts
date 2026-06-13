import { Test, TestingModule } from '@nestjs/testing';
import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { ConfigService } from '../config/config.service';
import { RefreshTokenService } from './refresh-token.service';
import { ERROR_CODES } from '../common/exceptions';
import * as crypto from 'crypto';

const CONTEXT = 'PasswordResetService';

// MailService の型定義（モジュールが未作成のため inline mock で代用）
interface MailServiceLike {
	sendPasswordResetEmail: jest.MockedFunction<(to: string, url: string) => Promise<boolean>>;
}

const makeSha256 = (plain: string) => crypto.createHash('sha256').update(plain).digest('hex');

describe('PasswordResetService', () => {
	let service: PasswordResetService;
	let prisma: jest.Mocked<PrismaService>;
	let mailService: MailServiceLike;
	let refreshTokenService: jest.Mocked<Pick<RefreshTokenService, 'revokeAllForUser'>>;
	let configService: jest.Mocked<Pick<ConfigService, 'passwordResetUrlBase' | 'isDevelopment'>>;
	let logger: jest.Mocked<AppLogger>;

	beforeEach(async () => {
		prisma = {
			user: {
				findUnique: jest.fn(),
				findFirst: jest.fn(),
				update: jest.fn(),
			},
		} as unknown as jest.Mocked<PrismaService>;

		mailService = {
			sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
		};

		refreshTokenService = {
			revokeAllForUser: jest.fn().mockResolvedValue(1),
		};

		configService = {
			passwordResetUrlBase: 'http://localhost:5173/auth/reset-password/confirm',
			isDevelopment: true,
		};

		logger = {
			log: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
			setContext: jest.fn(),
		} as unknown as jest.Mocked<AppLogger>;

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				PasswordResetService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: 'MailService', useValue: mailService },
				{ provide: RefreshTokenService, useValue: refreshTokenService },
				{ provide: ConfigService, useValue: configService },
				{ provide: AppLogger, useValue: logger },
			],
		}).compile();

		service = module.get<PasswordResetService>(PasswordResetService);
	});

	describe('requestReset', () => {
		it('存在するパスワードユーザーのトークンハッシュと1時間後の期限を保存する', async () => {
			const user = { id: 'user-1', email: 'test@example.com', password: 'hashed' };
			(prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
			(prisma.user.update as jest.Mock).mockResolvedValue(user);

			const before = Date.now();
			await service.requestReset('test@example.com');
			const after = Date.now();

			expect(prisma.user.update).toHaveBeenCalledTimes(1);
			const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
			const { resetPasswordToken, resetPasswordExpires } = updateCall.data;

			expect(typeof resetPasswordToken).toBe('string');
			expect(resetPasswordToken).toHaveLength(64); // sha256 hex = 64 chars
			expect(resetPasswordExpires.getTime()).toBeGreaterThanOrEqual(before + 3_600_000 - 50);
			expect(resetPasswordExpires.getTime()).toBeLessThanOrEqual(after + 3_600_000 + 50);
		});

		it('存在するユーザーに対してメール送信を呼び出す', async () => {
			const user = { id: 'user-1', email: 'test@example.com', password: 'hashed' };
			(prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
			(prisma.user.update as jest.Mock).mockResolvedValue(user);

			await service.requestReset('test@example.com');

			expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
			const [to, url] = mailService.sendPasswordResetEmail.mock.calls[0];
			expect(to).toBe('test@example.com');
			expect(url).toContain('http://localhost:5173/auth/reset-password/confirm');
			expect(url).toContain('?token=');
		});

		it('再要求時は既存トークン・期限を上書きして旧トークンを無効化する', async () => {
			const user = {
				id: 'user-1',
				email: 'test@example.com',
				password: 'hashed',
				resetPasswordToken: 'old-hash',
				resetPasswordExpires: new Date(Date.now() + 3_600_000),
			};
			(prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
			(prisma.user.update as jest.Mock).mockResolvedValue(user);

			await service.requestReset('test@example.com');

			const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
			expect(updateCall.data.resetPasswordToken).not.toBe('old-hash');
			expect(updateCall.data.resetPasswordToken).toHaveLength(64);
		});

		it('OAuthユーザー（password=null）はトークン発行もメール送信もしない', async () => {
			const oauthUser = { id: 'user-2', email: 'oauth@example.com', password: null };
			(prisma.user.findUnique as jest.Mock).mockResolvedValue(oauthUser);

			await service.requestReset('oauth@example.com');

			expect(prisma.user.update).not.toHaveBeenCalled();
			expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
		});

		it('存在しないユーザーは副作用なく例外も投げない', async () => {
			(prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

			await expect(service.requestReset('notfound@example.com')).resolves.toBeUndefined();

			expect(prisma.user.update).not.toHaveBeenCalled();
			expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
		});

		it('メール送信が失敗しても例外を伝播しない', async () => {
			const user = { id: 'user-1', email: 'test@example.com', password: 'hashed' };
			(prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
			(prisma.user.update as jest.Mock).mockResolvedValue(user);
			mailService.sendPasswordResetEmail.mockResolvedValue(false);

			await expect(service.requestReset('test@example.com')).resolves.toBeUndefined();
		});
	});

	describe('confirmReset', () => {
		const plainToken = 'a'.repeat(64);
		const tokenHash = makeSha256(plainToken);

		it('正常確定でパスワード更新・トークンクリア・Refresh Token revoke が行われる', async () => {
			const user = {
				id: 'user-1',
				resetPasswordToken: tokenHash,
				resetPasswordExpires: new Date(Date.now() + 3_600_000),
			};
			(prisma.user.findFirst as jest.Mock).mockResolvedValue(user);
			(prisma.user.update as jest.Mock).mockResolvedValue(user);

			await service.confirmReset(plainToken, 'NewPass1');

			const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
			expect(typeof updateCall.data.password).toBe('string'); // bcrypt hash
			expect(updateCall.data.resetPasswordToken).toBeNull();
			expect(updateCall.data.resetPasswordExpires).toBeNull();
			expect(refreshTokenService.revokeAllForUser).toHaveBeenCalledWith('user-1', 'password_reset');
		});

		it('トークン不一致で無効トークンエラー（AUTH003）を投げる', async () => {
			(prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

			await expect(service.confirmReset('wrongtoken', 'NewPass1')).rejects.toMatchObject({
				code: ERROR_CODES.AUTH.INVALID_TOKEN,
			});
			expect(prisma.user.update).not.toHaveBeenCalled();
		});

		it('期限切れトークンで期限切れエラー（AUTH014）を投げる', async () => {
			const expiredUser = {
				id: 'user-1',
				resetPasswordToken: tokenHash,
				resetPasswordExpires: new Date(Date.now() - 1), // 過去
			};
			(prisma.user.findFirst as jest.Mock).mockResolvedValue(expiredUser);

			await expect(service.confirmReset(plainToken, 'NewPass1')).rejects.toMatchObject({
				code: ERROR_CODES.AUTH.RESET_TOKEN_EXPIRED,
			});
			expect(prisma.user.update).not.toHaveBeenCalled();
		});

		it('使用済みトークン（クリア済み）再使用で無効トークンエラー（AUTH003）を投げる', async () => {
			// 確定後は resetPasswordToken=null になるため findFirst は null を返す
			(prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

			await expect(service.confirmReset(plainToken, 'NewPass1')).rejects.toMatchObject({
				code: ERROR_CODES.AUTH.INVALID_TOKEN,
			});
		});
	});
});
