import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { ConfigService } from '../config/config.service';
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

	beforeEach(async () => {
		jest.clearAllMocks();

		configService = {
			slackFeedbackWebhookUrl: 'https://hooks.slack.com/services/test',
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FeedbackService,
				{
					provide: ConfigService,
					useValue: configService,
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
		const sender = {
			name: '喜多川海夢',
			email: 'kaito@example.com',
		};

		it('Slack 成功時に正しいペイロードで fetch が呼ばれること', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			await service.submit(dto, sender);

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

			await expect(service.submit(dto, sender)).resolves.toBeUndefined();

			expect(Sentry.captureException).toHaveBeenCalledWith(networkError, {
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
				],
			}).compile();
			const serviceWithoutUrl = moduleWithoutUrl.get<FeedbackService>(FeedbackService);

			await serviceWithoutUrl.submit(dto, sender);

			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('improvement カテゴリは正しい絵文字・色で送信される', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			await service.submit({ ...dto, category: FeedbackCategory.Improvement }, sender);

			const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
				text: string;
				attachments: Array<{ color: string }>;
			};
			expect(body.text).toContain('🟡');
			expect(body.text).toContain('改善要望');
			expect(body.attachments[0].color).toBe('#FFC107');
		});

		it('other カテゴリは正しい絵文字・色で送信される', async () => {
			mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

			await service.submit({ ...dto, category: FeedbackCategory.Other }, sender);

			const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
				text: string;
				attachments: Array<{ color: string }>;
			};
			expect(body.text).toContain('🔵');
			expect(body.text).toContain('その他');
			expect(body.attachments[0].color).toBe('#2196F3');
		});
	});
});
