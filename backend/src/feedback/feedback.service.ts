import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { ConfigService } from '../config/config.service';
import { FeedbackCategory } from './dto/create-feedback.dto';

interface FeedbackSender {
	name: string;
	email: string;
}

const CATEGORY_SLACK_CONFIG = {
	[FeedbackCategory.Bug]: { label: '不具合', emoji: '🔴', color: '#FF0000' },
	[FeedbackCategory.Improvement]: { label: '改善要望', emoji: '🟡', color: '#FFC107' },
	[FeedbackCategory.Other]: { label: 'その他', emoji: '🔵', color: '#2196F3' },
} as const;

@Injectable()
export class FeedbackService {
	private readonly logger = new Logger(FeedbackService.name);

	constructor(private readonly configService: ConfigService) {}

	async submit(
		dto: { category: FeedbackCategory; message: string },
		sender: FeedbackSender,
	): Promise<void> {
		const webhookUrl = this.configService.slackFeedbackWebhookUrl;
		if (!webhookUrl) {
			this.logger.warn('SLACK_FEEDBACK_WEBHOOK_URL が未設定のため Slack 通知をスキップします');
			return;
		}

		const config = CATEGORY_SLACK_CONFIG[dto.category];
		const sentAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

		const payload = {
			text: `${config.emoji} ${config.label} が届きました`,
			attachments: [
				{
					color: config.color,
					fields: [
						{ title: 'カテゴリ', value: config.label, short: true },
						{ title: '送信者名', value: sender.name, short: true },
						{ title: 'メールアドレス', value: sender.email, short: true },
						{ title: '送信日時', value: sentAt, short: true },
						{ title: 'メッセージ', value: dto.message, short: false },
					],
				},
			],
		};

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		try {
			await fetch(webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
		} catch (err) {
			Sentry.captureException(err, { tags: { feature_area: 'system' } });
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
