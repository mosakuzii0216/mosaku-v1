import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import * as Sentry from '@sentry/nestjs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { REFRESH_TOKEN_EXPIRATION } from '../config/auth-constants';
import { ERROR_CODES, throwUnauthorized } from '../common/exceptions';

const REFRESH_TOKEN_BYTES = 32;

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d|w|y)$/;
const UNIT_TO_MS: Record<string, number> = {
	ms: 1,
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
	w: 7 * 86_400_000,
	y: 365 * 86_400_000,
};

export interface IssueResult {
	plainRt: string;
	expiresAt: Date;
	familyId: string;
}

export interface IssueContext {
	userId: string;
	ip: string | null;
	userAgent: string | null;
	familyId?: string;
}

export interface RotateContext {
	plainRt: string;
	ip: string | null;
	userAgent: string | null;
}

export interface RotateResult extends IssueResult {
	userId: string;
}

export type RevokeAllReason = 'password_change' | 'admin';

@Injectable()
export class RefreshTokenService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly repository: RefreshTokenRepository,
		private readonly configService: ConfigService,
	) {}

	async issue(ctx: IssueContext): Promise<IssueResult> {
		const plainRt = this.generatePlainToken();
		const tokenHash = this.hashToken(plainRt);
		const familyId = ctx.familyId ?? randomUUID();
		const issuedAt = new Date();
		const expiresAt = new Date(issuedAt.getTime() + this.getExpirationMs());

		try {
			await this.repository.create({
				userId: ctx.userId,
				tokenHash,
				familyId,
				status: 'active',
				issuedAt,
				expiresAt,
				ip: ctx.ip,
				userAgent: ctx.userAgent,
			});
		} catch (error) {
			Sentry.captureMessage('refresh_token_issue_failed', {
				level: 'error',
				tags: { feature_area: 'auth' },
			});
			throw error;
		}

		Sentry.captureMessage('refresh_token_issued', {
			level: 'info',
			tags: { feature_area: 'auth' },
		});

		return { plainRt, expiresAt, familyId };
	}

	async rotate(ctx: RotateContext): Promise<RotateResult> {
		const tokenHash = this.hashToken(ctx.plainRt);
		const existing = await this.repository.findByHash(tokenHash);
		if (!existing) {
			throwUnauthorized(ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID);
		}

		if (existing.status === 'revoked') {
			throwUnauthorized(ERROR_CODES.AUTH.REFRESH_TOKEN_REVOKED);
		}

		if (existing.expiresAt.getTime() < Date.now()) {
			throwUnauthorized(ERROR_CODES.AUTH.REFRESH_TOKEN_EXPIRED);
		}

		if (existing.status === 'rotated') {
			await this.revokeFamilyForReuse(existing.familyId);
			throwUnauthorized(ERROR_CODES.AUTH.REFRESH_TOKEN_REUSED);
		}

		return await this.prisma.$transaction(async (tx) => {
			const rotated = await this.repository.markRotated(existing.id, new Date(), tx);
			if (!rotated) {
				await this.revokeFamilyForReuse(existing.familyId, tx);
				throwUnauthorized(ERROR_CODES.AUTH.REFRESH_TOKEN_REUSED);
			}

			const plainRt = this.generatePlainToken();
			const newTokenHash = this.hashToken(plainRt);
			const issuedAt = new Date();
			const expiresAt = new Date(issuedAt.getTime() + this.getExpirationMs());

			await this.repository.create(
				{
					userId: existing.userId,
					tokenHash: newTokenHash,
					familyId: existing.familyId,
					status: 'active',
					issuedAt,
					expiresAt,
					ip: ctx.ip,
					userAgent: ctx.userAgent,
				},
				tx,
			);

			Sentry.captureMessage('refresh_token_rotated', {
				level: 'info',
				tags: { feature_area: 'auth' },
			});

			return {
				plainRt,
				expiresAt,
				familyId: existing.familyId,
				userId: existing.userId,
			};
		});
	}

	async revoke(plainRt: string): Promise<void> {
		const tokenHash = this.hashToken(plainRt);
		const existing = await this.repository.findByHash(tokenHash);
		if (!existing) {
			return;
		}

		await this.repository.revoke(existing.id);

		Sentry.captureMessage('refresh_token_revoked', {
			level: 'info',
			tags: { feature_area: 'auth', reason: 'logout' },
		});
	}

	async revokeAllForUser(userId: string, reason: RevokeAllReason): Promise<number> {
		const count = await this.repository.revokeAllForUser(userId);

		Sentry.captureMessage('refresh_token_revoked', {
			level: 'info',
			tags: { feature_area: 'auth', reason },
			extra: { count },
		});

		return count;
	}

	private async revokeFamilyForReuse(
		familyId: string,
		tx?: Prisma.TransactionClient,
	): Promise<void> {
		const count = await this.repository.revokeByFamily(familyId, tx);
		Sentry.captureMessage('refresh_token_reuse_detected', {
			level: 'warning',
			tags: { feature_area: 'auth' },
			extra: { familyId, count },
		});
	}

	private generatePlainToken(): string {
		return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
	}

	private hashToken(plain: string): string {
		return createHmac('sha256', this.configService.refreshTokenPepper).update(plain).digest('hex');
	}

	private getExpirationMs(): number {
		const match = DURATION_PATTERN.exec(String(REFRESH_TOKEN_EXPIRATION).trim());
		if (!match) {
			throw new Error(`Invalid REFRESH_TOKEN_EXPIRATION: ${String(REFRESH_TOKEN_EXPIRATION)}`);
		}
		const num = parseInt(match[1], 10);
		const unit = match[2];
		return num * UNIT_TO_MS[unit];
	}
}
