import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type RefreshTokenStatus = 'active' | 'rotated' | 'revoked';

export interface RefreshTokenRecord {
	id: string;
	userId: string;
	tokenHash: string;
	familyId: string;
	status: RefreshTokenStatus;
	issuedAt: Date;
	expiresAt: Date;
	lastUsedAt: Date | null;
	ip: string | null;
	userAgent: string | null;
}

export type RefreshTokenCreateInput = Omit<RefreshTokenRecord, 'id' | 'lastUsedAt'>;

type PrismaClientLike = Pick<PrismaService, 'refreshToken'> | Prisma.TransactionClient;

@Injectable()
export class RefreshTokenRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(
		input: RefreshTokenCreateInput,
		tx?: Prisma.TransactionClient,
	): Promise<RefreshTokenRecord> {
		const client = this.getClient(tx);
		const record = await client.refreshToken.create({ data: input });
		return this.toRecord(record);
	}

	async findByHash(
		tokenHash: string,
		tx?: Prisma.TransactionClient,
	): Promise<RefreshTokenRecord | null> {
		const client = this.getClient(tx);
		const record = await client.refreshToken.findUnique({ where: { tokenHash } });
		return record ? this.toRecord(record) : null;
	}

	async markRotated(
		id: string,
		lastUsedAt: Date,
		tx?: Prisma.TransactionClient,
	): Promise<RefreshTokenRecord | null> {
		const client = this.getClient(tx);
		const { count } = await client.refreshToken.updateMany({
			where: { id, status: 'active' },
			data: { status: 'rotated', lastUsedAt },
		});
		if (count === 0) {
			return null;
		}
		const record = await client.refreshToken.findUnique({ where: { id } });
		return record ? this.toRecord(record) : null;
	}

	async revoke(id: string, tx?: Prisma.TransactionClient): Promise<RefreshTokenRecord | null> {
		const client = this.getClient(tx);
		const { count } = await client.refreshToken.updateMany({
			where: { id, status: { in: ['active', 'rotated'] } },
			data: { status: 'revoked' },
		});
		if (count === 0) {
			return null;
		}
		const record = await client.refreshToken.findUnique({ where: { id } });
		return record ? this.toRecord(record) : null;
	}

	async revokeByFamily(familyId: string, tx?: Prisma.TransactionClient): Promise<number> {
		const client = this.getClient(tx);
		const { count } = await client.refreshToken.updateMany({
			where: { familyId, status: { in: ['active', 'rotated'] } },
			data: { status: 'revoked' },
		});
		return count;
	}

	async revokeAllForUser(userId: string, tx?: Prisma.TransactionClient): Promise<number> {
		const client = this.getClient(tx);
		const { count } = await client.refreshToken.updateMany({
			where: { userId, status: { in: ['active', 'rotated'] } },
			data: { status: 'revoked' },
		});
		return count;
	}

	async pruneExpired(now: Date, tx?: Prisma.TransactionClient): Promise<number> {
		const client = this.getClient(tx);
		const { count } = await client.refreshToken.deleteMany({
			where: { expiresAt: { lt: now } },
		});
		return count;
	}

	private getClient(tx?: Prisma.TransactionClient): PrismaClientLike {
		return tx ?? this.prisma;
	}

	private toRecord(raw: {
		id: string;
		userId: string;
		tokenHash: string;
		familyId: string;
		status: RefreshTokenStatus;
		issuedAt: Date;
		expiresAt: Date;
		lastUsedAt: Date | null;
		ip: string | null;
		userAgent: string | null;
	}): RefreshTokenRecord {
		return {
			id: raw.id,
			userId: raw.userId,
			tokenHash: raw.tokenHash,
			familyId: raw.familyId,
			status: raw.status,
			issuedAt: raw.issuedAt,
			expiresAt: raw.expiresAt,
			lastUsedAt: raw.lastUsedAt,
			ip: raw.ip,
			userAgent: raw.userAgent,
		};
	}
}
