import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import * as Sentry from '@sentry/nestjs';
import { ConfigService } from '../config/config.service';
import { AppLogger } from '../common/logger/app-logger.service';

@Injectable()
export class MailService {
	private readonly resend: Resend | null = null;
	private readonly isConfigured: boolean;
	private readonly logger = new AppLogger();

	constructor(private readonly configService: ConfigService) {
		const apiKey = configService.resendApiKey;
		this.isConfigured = !!apiKey;
		if (!this.isConfigured) {
			this.logger.warn(
				'Resend API key is not configured. Set RESEND_API_KEY to enable email sending.',
				'MailService',
			);
		} else {
			this.resend = new Resend(apiKey);
		}
	}

	async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
		if (!this.isConfigured || !this.resend) {
			return false;
		}

		try {
			const { error } = await this.resend.emails.send({
				from: this.configService.mailFrom,
				to,
				subject: 'パスワードの再設定',
				html: this.buildResetEmailHtml(resetUrl),
			});

			if (error) {
				Sentry.captureException(new Error(error.message), {
					tags: { feature_area: 'auth' },
				});
				return false;
			}

			return true;
		} catch (err) {
			Sentry.captureException(err, { tags: { feature_area: 'auth' } });
			return false;
		}
	}

	private buildResetEmailHtml(resetUrl: string): string {
		return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>パスワードの再設定</h2>
  <p>パスワードの再設定リクエストを受け付けました。</p>
  <p>以下のリンクをクリックしてパスワードを再設定してください。リンクの有効期限は1時間です。</p>
  <p>
    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">
      パスワードを再設定する
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">このリクエストに心当たりがない場合は、このメールを無視してください。</p>
</div>`.trim();
	}
}
