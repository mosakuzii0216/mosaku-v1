import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { RefreshTokenService } from './refresh-token.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { ERROR_CODES, throwBadRequest } from '../common/exceptions';
import { BCRYPT_SALT_ROUNDS } from '../config/auth-constants';

const CONTEXT = 'PasswordResetService';
const TOKEN_BYTES = 32;
const EXPIRY_MS = 3_600_000; // 1 hour

function sha256(plain: string): string {
	return createHash('sha256').update(plain).digest('hex');
}

export const MAIL_SERVICE = 'MailService';

export interface IMailService {
	sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean>;
}

@Injectable()
export class PasswordResetService {
	constructor(
		private readonly prisma: PrismaService,
		@Inject(MAIL_SERVICE) private readonly mailService: IMailService,
		private readonly refreshTokenService: RefreshTokenService,
		private readonly configService: ConfigService,
		private readonly logger: AppLogger,
	) {}

	async requestReset(email: string): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { email } });

		if (!user || !user.password) {
			this.logger.log('password reset requested for unknown/OAuth account', CONTEXT);
			return;
		}

		const plainToken = randomBytes(TOKEN_BYTES).toString('hex');
		const tokenHash = sha256(plainToken);
		const expires = new Date(Date.now() + EXPIRY_MS);

		await this.prisma.user.update({
			where: { id: user.id },
			data: {
				resetPasswordToken: tokenHash,
				resetPasswordExpires: expires,
			},
		});

		this.logger.log('password reset token issued', CONTEXT);

		const resetUrl = `${this.configService.passwordResetUrlBase}?token=${plainToken}`;

		if (this.configService.isDevelopment) {
			this.logger.log(`[DEV] reset URL: ${resetUrl}`, CONTEXT);
		}

		await this.mailService.sendPasswordResetEmail(user.email, resetUrl);
	}

	async confirmReset(token: string, newPassword: string): Promise<void> {
		const tokenHash = sha256(token);

		const user = await this.prisma.user.findFirst({
			where: { resetPasswordToken: tokenHash },
		});

		if (!user) {
			throwBadRequest(ERROR_CODES.AUTH.INVALID_TOKEN);
		}

		if (!user.resetPasswordExpires || user.resetPasswordExpires.getTime() < Date.now()) {
			throwBadRequest(ERROR_CODES.AUTH.RESET_TOKEN_EXPIRED);
		}

		const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

		try {
			await this.prisma.user.update({
				where: { id: user.id },
				data: {
					password: hashedPassword,
					resetPasswordToken: null,
					resetPasswordExpires: null,
				},
			});
		} catch (err) {
			Sentry.captureException(err, { tags: { feature_area: 'auth' } });
			throw err;
		}

		this.logger.log('password reset confirmed', CONTEXT);

		try {
			await this.refreshTokenService.revokeAllForUser(user.id, 'password_reset');
		} catch (err) {
			this.logger.warn('failed to revoke refresh tokens after password reset', CONTEXT);
			Sentry.captureException(err, { tags: { feature_area: 'auth' } });
		}
	}
}
