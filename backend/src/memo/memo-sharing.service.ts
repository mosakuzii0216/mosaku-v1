import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as Sentry from '@sentry/nestjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { ERROR_CODES, throwNotFound } from '../common/exceptions';

const TOKEN_BYTE_LENGTH = 32; // 256 bit entropy
const MAX_TOKEN_GENERATION_ATTEMPTS = 5;

export interface PublishedMemoResult {
	memoId: string;
	publicToken: string;
	publishedAt: Date;
}

export interface PublicMemoListItem {
	memoId: string;
	title: string;
	publicToken: string;
	publishedAt: Date;
	updatedAt: Date;
}

export interface PublicMemoView {
	title: string;
	content: string;
	updatedAt: Date;
}

type UnpublishReason = 'manual' | 'cascade-trash';

@Injectable()
export class MemoSharingService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly authorizationService: AuthorizationService,
	) {}

	async publishMemo(memoId: string, userId: string): Promise<PublishedMemoResult> {
		const memo = await this.prisma.memo.findFirst({
			where: { id: memoId, trashedAt: null },
			select: { id: true, userId: true },
		});
		this.authorizationService.validateOwnership(memo, userId, 'Memo');

		const updated = await this.updateWithUniqueToken(memoId);

		Sentry.captureMessage('memo_public_published', {
			level: 'info',
			tags: { feature_area: 'memo' },
			extra: { memoId },
		});

		return {
			memoId: updated.id,
			publicToken: updated.publicToken,
			publishedAt: updated.publishedAt,
		};
	}

	async unpublishMemo(memoId: string, userId: string): Promise<void> {
		const memo = await this.prisma.memo.findFirst({
			where: { id: memoId, trashedAt: null },
			select: { id: true, userId: true, publicToken: true },
		});
		this.authorizationService.validateOwnership(memo, userId, 'Memo');

		if (!memo!.publicToken) {
			return;
		}

		await this.prisma.memo.update({
			where: { id: memoId },
			data: { publicToken: null, publishedAt: null },
		});

		this.captureUnpublishEvent(memoId, 'manual');
	}

	async unpublishIfPublished(memoId: string, userId: string): Promise<void> {
		const memo = await this.prisma.memo.findFirst({
			where: { id: memoId },
			select: { id: true, userId: true, publicToken: true },
		});
		if (!memo) return;
		if (memo.userId !== userId) return;
		if (!memo.publicToken) return;

		await this.prisma.memo.update({
			where: { id: memoId },
			data: { publicToken: null, publishedAt: null },
		});

		this.captureUnpublishEvent(memoId, 'cascade-trash');
	}

	async regenerateToken(memoId: string, userId: string): Promise<PublishedMemoResult> {
		const memo = await this.prisma.memo.findFirst({
			where: { id: memoId, trashedAt: null },
			select: { id: true, userId: true, publicToken: true },
		});
		this.authorizationService.validateOwnership(memo, userId, 'Memo');

		if (!memo!.publicToken) {
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, 'Memo not found');
		}

		const updated = await this.updateWithUniqueToken(memoId);

		Sentry.captureMessage('memo_public_token_regenerated', {
			level: 'info',
			tags: { feature_area: 'memo' },
			extra: { memoId },
		});

		return {
			memoId: updated.id,
			publicToken: updated.publicToken,
			publishedAt: updated.publishedAt,
		};
	}

	async listMyPublicMemos(userId: string): Promise<PublicMemoListItem[]> {
		const memos = await this.prisma.memo.findMany({
			where: { userId, trashedAt: null, publicToken: { not: null } },
			select: {
				id: true,
				title: true,
				publicToken: true,
				publishedAt: true,
				updatedAt: true,
			},
			orderBy: { publishedAt: 'desc' },
		});

		return memos.map((m) => ({
			memoId: m.id,
			title: m.title,
			publicToken: m.publicToken as string,
			publishedAt: m.publishedAt as Date,
			updatedAt: m.updatedAt,
		}));
	}

	async findByToken(token: string): Promise<PublicMemoView> {
		const memo = await this.prisma.memo.findFirst({
			where: { publicToken: token, trashedAt: null },
			select: { title: true, content: true, updatedAt: true },
		});
		if (!memo) {
			throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, 'Memo not found');
		}
		return memo;
	}

	private async updateWithUniqueToken(memoId: string): Promise<{
		id: string;
		publicToken: string;
		publishedAt: Date;
	}> {
		for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt++) {
			const publicToken = this.generateToken();
			try {
				const updated = await this.prisma.memo.update({
					where: { id: memoId },
					data: { publicToken, publishedAt: new Date() },
					select: { id: true, publicToken: true, publishedAt: true },
				});
				return {
					id: updated.id,
					publicToken: updated.publicToken as string,
					publishedAt: updated.publishedAt as Date,
				};
			} catch (error) {
				if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
					continue;
				}
				throw error;
			}
		}

		const exhaustError = new Error(
			'Failed to generate a unique public memo token after maximum retries',
		);
		Sentry.captureException(exhaustError, {
			tags: { feature_area: 'memo' },
			extra: { memoId, maxAttempts: MAX_TOKEN_GENERATION_ATTEMPTS },
		});
		throw exhaustError;
	}

	private generateToken(): string {
		return randomBytes(TOKEN_BYTE_LENGTH).toString('base64url');
	}

	private captureUnpublishEvent(memoId: string, reason: UnpublishReason): void {
		Sentry.captureMessage('memo_public_unpublished', {
			level: 'info',
			tags: { feature_area: 'memo' },
			extra: { memoId, reason },
		});
	}
}
