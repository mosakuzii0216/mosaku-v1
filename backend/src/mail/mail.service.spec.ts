import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { MailService } from './mail.service';
import { ConfigService } from '../config/config.service';

const mockEmailsSend = jest.fn();

jest.mock('resend', () => ({
	Resend: jest.fn().mockImplementation(() => ({
		emails: {
			send: mockEmailsSend,
		},
	})),
}));

jest.mock('@sentry/nestjs', () => ({
	captureException: jest.fn(),
}));

describe('MailService', () => {
	let service: MailService;

	const createService = async (apiKey: string | undefined) => {
		const mockConfigService = {
			resendApiKey: apiKey,
			mailFrom: 'onboarding@resend.dev',
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [MailService, { provide: ConfigService, useValue: mockConfigService }],
		}).compile();

		service = module.get<MailService>(MailService);
		return service;
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('RESEND_API_KEY が未設定の場合', () => {
		it('sendPasswordResetEmail は false を返すこと', async () => {
			await createService(undefined);
			const result = await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(result).toBe(false);
		});

		it('Resend SDK を呼ばないこと', async () => {
			await createService(undefined);
			await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(mockEmailsSend).not.toHaveBeenCalled();
		});

		it('例外を投げないこと', async () => {
			await createService(undefined);
			await expect(
				service.sendPasswordResetEmail('user@example.com', 'https://example.com/reset?token=abc'),
			).resolves.not.toThrow();
		});

		it('Sentry.captureException を呼ばないこと', async () => {
			await createService(undefined);
			await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(Sentry.captureException).not.toHaveBeenCalled();
		});
	});

	describe('Resend SDK が { error } を返す場合', () => {
		beforeEach(async () => {
			mockEmailsSend.mockResolvedValue({
				data: null,
				error: { message: 'API Error', name: 'validation_error' },
			});
			await createService('re_test_key');
		});

		it('false を返すこと', async () => {
			const result = await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(result).toBe(false);
		});

		it('Sentry.captureException を feature_area: auth で呼ぶこと', async () => {
			await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
				tags: { feature_area: 'auth' },
			});
		});

		it('例外を投げないこと', async () => {
			await expect(
				service.sendPasswordResetEmail('user@example.com', 'https://example.com/reset?token=abc'),
			).resolves.not.toThrow();
		});
	});

	describe('Resend SDK が例外を投げる場合', () => {
		beforeEach(async () => {
			mockEmailsSend.mockRejectedValue(new Error('Network error'));
			await createService('re_test_key');
		});

		it('false を返すこと', async () => {
			const result = await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(result).toBe(false);
		});

		it('Sentry.captureException を feature_area: auth で呼ぶこと', async () => {
			await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
				tags: { feature_area: 'auth' },
			});
		});

		it('例外を投げないこと', async () => {
			await expect(
				service.sendPasswordResetEmail('user@example.com', 'https://example.com/reset?token=abc'),
			).resolves.not.toThrow();
		});
	});

	describe('正常送信の場合', () => {
		beforeEach(async () => {
			mockEmailsSend.mockResolvedValue({ data: { id: 'email-id-123' }, error: null });
			await createService('re_test_key');
		});

		it('true を返すこと', async () => {
			const result = await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(result).toBe(true);
		});

		it('Sentry.captureException を呼ばないこと', async () => {
			await service.sendPasswordResetEmail(
				'user@example.com',
				'https://example.com/reset?token=abc',
			);
			expect(Sentry.captureException).not.toHaveBeenCalled();
		});
	});
});
