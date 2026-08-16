import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import * as Sentry from '@sentry/nestjs';
import { FeedbackCategory } from './dto/create-feedback.dto';

jest.mock('@sentry/nestjs', () => ({
	captureException: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('FeedbackService', () => {
	let service: FeedbackService;
	let configService: jest.Mocked<Pick<ConfigService, 'slackFeedbackWebhookUrl'>>;
	let mockPrisma: { feedback: { create: jest.Mock } };

	beforeEach(async () => {
		jest.clearAllMocks();

		configService = {
			slackFeedbackWebhookUrl: 'https://hooks.slack.com/services/test',
		};

		mockPrisma = {
			feedback: {
				create: jest.fn().mockResolvedValue({ id: 'test-id' }),
			},
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FeedbackService,
				{
					provide: ConfigService,
					useValue: configService,
				},
				{
					provide: PrismaService,
					useValue: mockPrisma,
				},
			],
		}).compile();

		service = module.get<FeedbackService>(FeedbackService);
	});

	describe('submit()', () => {
		const dto = {
			category: FeedbackCategory.Bug,
			message: 'バグを発見しました',
		};
		const context = {
			userId: 'user-123',
			name: '喜多川海夢',
			email: 'kaito@example.com',
		};

		it('Slack 成功・DB 成功の場合に void が返り例外が throw されないこと', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			const result = await service.submit(dto, context);

			expect(result).toBeUndefined();
			expect(Sentry.captureException).not.toHaveBeenCalled();
		});

		it('Slack 成功時に正しいペイロードで fetch が呼ばれること', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			await service.submit(dto, context);

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://hooks.slack.com/services/test');
			expect(options.method).toBe('POST');

			const body = JSON.parse(options.body as string) as {
				text: string;
				attachments: Array<{
					color: string;
					fields: Array<{ title: string; value: string }>;
				}>;
			};
			expect(body.text).toContain('🔴');
			expect(body.text).toContain('不具合');
			expect(body.attachments[0].color).toBe('#FF0000');

			const fields = body.attachments[0].fields;
			const categoryField = fields.find((f) => f.title === 'カテゴリ');
			const messageField = fields.find((f) => f.title === 'メッセージ');
			const nameField = fields.find((f) => f.title === '送信者名');
			const emailField = fields.find((f) => f.title === 'メールアドレス');
			const dateField = fields.find((f) => f.title === '送信日時');

			expect(categoryField?.value).toBe('不具合');
			expect(messageField?.value).toBe('バグを発見しました');
			expect(nameField?.value).toBe('喜多川海夢');
			expect(emailField?.value).toBe('kaito@example.com');
			expect(dateField?.value).toBeTruthy();
		});

		it('Slack 失敗時に Sentry.captureException が呼ばれ、例外が上位に伝播しないこと', async () => {
			const networkError = new Error('Connection refused');
			mockFetch.mockRejectedValueOnce(networkError);

			const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

			await expect(service.submit(dto, context)).resolves.toBeUndefined();

			expect(Sentry.captureException).toHaveBeenCalledWith(networkError, {
				tags: { feature_area: 'system' },
			});
			// Slack 失敗は logger.warn に降格されない（#1 回帰）
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it('Slack fetch が AbortError（タイムアウト）で reject した場合に Sentry に記録されること', async () => {
			const abortError = new DOMException('The operation was aborted', 'AbortError');
			mockFetch.mockRejectedValueOnce(abortError);

			await expect(service.submit(dto, context)).resolves.toBeUndefined();

			expect(Sentry.captureException).toHaveBeenCalledWith(abortError, {
				tags: { feature_area: 'system' },
			});
		});

		it('Webhook URL が空の場合に fetch が呼ばれないこと', async () => {
			(configService as { slackFeedbackWebhookUrl: string | undefined }).slackFeedbackWebhookUrl =
				undefined;

			const moduleWithoutUrl: TestingModule = await Test.createTestingModule({
				providers: [
					FeedbackService,
					{
						provide: ConfigService,
						useValue: configService,
					},
					{
						provide: PrismaService,
						useValue: mockPrisma,
					},
				],
			}).compile();
			const serviceWithoutUrl = moduleWithoutUrl.get<FeedbackService>(FeedbackService);

			await serviceWithoutUrl.submit(dto, context);

			expect(mockFetch).not.toHaveBeenCalled();
			// URL 未設定でも DB 保存は実行される（#3 回帰）
			expect(mockPrisma.feedback.create).toHaveBeenCalled();
			// URL 未設定は Sentry に記録されない（#3 回帰）
			expect(Sentry.captureException).not.toHaveBeenCalled();
		});

		it('DB 保存に userId・category・message が正しい値で渡されること', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			await service.submit(dto, context);

			expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
				data: {
					userId: 'user-123',
					category: FeedbackCategory.Bug,
					message: 'バグを発見しました',
				},
			});
		});

		it('DB 失敗・Slack 成功の場合に logger.warn が呼ばれ Sentry は呼ばれず void が返ること', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
			const dbError = new Error('DB connection failed');
			mockPrisma.feedback.create.mockRejectedValueOnce(dbError);

			const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

			await expect(service.submit(dto, context)).resolves.toBeUndefined();

			expect(warnSpy).toHaveBeenCalledWith('フィードバックの DB 保存に失敗しました', dbError);
			expect(Sentry.captureException).not.toHaveBeenCalled();
		});

		it('Slack が HTTP 4xx/5xx を返した場合に Sentry.captureException が呼ばれること', async () => {
			mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

			await expect(service.submit(dto, context)).resolves.toBeUndefined();

			expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
				tags: { feature_area: 'system' },
			});
		});

		it('improvement カテゴリは正しい絵文字・色で送信される', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			await service.submit({ ...dto, category: FeedbackCategory.Improvement }, context);

			const body = JSON.parse(
				(mockFetch.mock.calls as Array<[unknown, { body: string }]>)[0][1].body,
			) as {
				text: string;
				attachments: Array<{ color: string }>;
			};
			expect(body.text).toContain('🟡');
			expect(body.text).toContain('改善要望');
			expect(body.attachments[0].color).toBe('#FFC107');
		});

		it('other カテゴリは正しい絵文字・色で送信される', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			await service.submit({ ...dto, category: FeedbackCategory.Other }, context);

			const body = JSON.parse(
				(mockFetch.mock.calls as Array<[unknown, { body: string }]>)[0][1].body,
			) as {
				text: string;
				attachments: Array<{ color: string }>;
			};
			expect(body.text).toContain('🔵');
			expect(body.text).toContain('その他');
			expect(body.attachments[0].color).toBe('#2196F3');
		});
	});
});
