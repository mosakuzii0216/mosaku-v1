/**
 * Task 1.2: 廃止プロバイダ（LINE / GitHub）エンドポイント除去の統合テスト
 *
 * - 廃止されたルート（/auth/github, /auth/github/callback, /auth/line, /auth/line/callback）が
 *   404 Not Found を返すこと（要件2.1）
 * - `/auth/oauth/:provider/start` に github/line を指定すると 400 で弾かれ、
 *   残プロバイダ（google/x/apple）は受理されること（要件2.2）
 */
import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtTokenService } from './jwt.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshCookieHelper } from './refresh-cookie.helper';
import { InvitationService } from '../invitation/invitation.service';
import { OAuthStateService } from './oauth-state.service';
import { XOAuthService } from './x-oauth.service';
import { PasswordResetService } from './password-reset.service';

describe('Task 1.2: 廃止プロバイダ（LINE / GitHub）エンドポイント除去', () => {
	let app: INestApplication;

	beforeAll(async () => {
		const configSvc = {
			generateSuccessRedirectUrl: jest.fn().mockReturnValue('http://localhost?token=xxx'),
			generateAuthFailedUrl: jest.fn().mockReturnValue('http://localhost?error=auth_failed'),
			generateInvitationStateInvalidUrl: jest.fn(),
			generateOAuthAuthorizationUrl: jest
				.fn()
				.mockImplementation((p: string, s: string) => `https://oauth.example.com/${p}?state=${s}`),
			adminEmail: undefined,
			isAdminEmail: jest.fn().mockReturnValue(false),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{
					provide: AuthService,
					useValue: {
						findUserById: jest.fn(),
						registerWithTokens: jest.fn(),
						login: jest.fn(),
						comparePassword: jest.fn(),
						hashPassword: jest.fn(),
					},
				},
				{ provide: OAuthService, useValue: {} },
				{
					provide: InvitationService,
					useValue: { verifyInvitation: jest.fn().mockResolvedValue({ code: 'ABCD1234' }) },
				},
				{ provide: ConfigService, useValue: configSvc },
				{
					provide: PrismaService,
					useValue: { user: { findUnique: jest.fn(), update: jest.fn() } },
				},
				{
					provide: JwtTokenService,
					useValue: { generateTokens: jest.fn().mockReturnValue({ accessToken: 'jwt' }) },
				},
				{
					provide: RefreshTokenService,
					useValue: {
						issue: jest.fn(),
						rotate: jest.fn(),
						revoke: jest.fn(),
						revokeAllForUser: jest.fn(),
					},
				},
				{
					provide: RefreshCookieHelper,
					useValue: { setRefreshCookie: jest.fn(), clearRefreshCookie: jest.fn() },
				},
				{
					provide: OAuthStateService,
					useValue: { issueState: jest.fn().mockReturnValue('signed.state') },
				},
				{
					provide: XOAuthService,
					useValue: { isConfigured: jest.fn().mockReturnValue(true) },
				},
				{
					provide: PasswordResetService,
					useValue: { requestReset: jest.fn(), confirmReset: jest.fn() },
				},
			],
		}).compile();

		app = moduleRef.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	describe('廃止エンドポイントの 404 化', () => {
		it.each(['/auth/github', '/auth/github/callback', '/auth/line', '/auth/line/callback'])(
			'GET %s は 404 Not Found を返すこと',
			async (path) => {
				await request(app.getHttpServer() as Server)
					.get(path)
					.expect(404);
			},
		);
	});

	describe('/auth/oauth/:provider/start の provider バリデーション', () => {
		it.each(['github', 'line'])('%s 指定は 400 Bad Request で弾かれること', async (provider) => {
			await request(app.getHttpServer() as Server)
				.post(`/auth/oauth/${provider}/start`)
				.send({ invitationCode: 'ABCD1234' })
				.expect(400);
		});

		it.each(['google', 'x', 'apple'])('%s 指定は受理されること（200）', async (provider) => {
			await request(app.getHttpServer() as Server)
				.post(`/auth/oauth/${provider}/start`)
				.send({ invitationCode: 'ABCD1234' })
				.expect(200);
		});
	});
});
