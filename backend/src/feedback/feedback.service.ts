import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackCategory } from './dto/create-feedback.dto';

interface FeedbackSubmitContext {
	userId: string;
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

	constructor(
		private readonly configService: ConfigService,
		private readonly prisma: PrismaService,
	) {}

	async submit(
		dto: { category: FeedbackCategory; message: string },
		context: FeedbackSubmitContext,
	): Promise<void> {
		// Slack は必須・DB は補助。それぞれ独立に settle させ、結果を named outcome に束縛する
		const slackOutcome = this.sendToSlack(dto, context).then(
			() => ({ ok: true as const }),
			(error: unknown) => ({ ok: false as const, error }),
		);
		const dbOutcome = this.prisma.feedback
			.create({
				data: {
					userId: context.userId,
					category: dto.category,
					message: dto.message,
				},
			})
			.then(
				() => ({ ok: true as const }),
				(error: unknown) => ({ ok: false as const, error }),
			);

		// 両者はすでに catch 済みなので Promise.all は reject しない
		const [slack, db] = await Promise.all([slackOutcome, dbOutcome]);

		// Slack（必須）失敗 → Sentry でハードアラート。throw はせず 201 を維持
		if (!slack.ok) {
			Sentry.captureException(slack.error, { tags: { feature_area: 'system' } });
		}
		// DB（補助）失敗 → logger.warn のみ
		if (!db.ok) {
			this.logger.warn('フィードバックの DB 保存に失敗しました', db.error);
		}
	}

	private async sendToSlack(
		dto: { category: FeedbackCategory; message: string },
		context: FeedbackSubmitContext,
	): Promise<void> {
		const webhookUrl = this.configService.slackFeedbackWebhookUrl;
		if (!webhookUrl) {
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
						{ title: '送信者名', value: context.name, short: true },
						{ title: 'メールアドレス', value: context.email, short: true },
						{ title: '送信日時', value: sentAt, short: true },
						{ title: 'メッセージ', value: dto.message, short: false },
					],
				},
			],
		};

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		try {
			const res = await fetch(webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			// fetch は HTTP 4xx/5xx で reject しないため、明示的に throw して失敗を検知する
			if (!res.ok) {
				throw new Error(`Slack Webhook returned HTTP ${res.status}`);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
