import { Injectable } from '@nestjs/common';
import type { McpRefreshToken, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type McpRefreshTokenRecord = McpRefreshToken;

export interface McpRefreshTokenCreateInput {
	tokenHash: string;
	clientId: string;
	userId: string;
	scope: string;
	expiresAt: Date;
}

@Injectable()
export class McpRefreshTokenStore {
	constructor(private readonly prisma: PrismaService) {}

	async create(input: McpRefreshTokenCreateInput): Promise<McpRefreshTokenRecord> {
		return this.prisma.mcpRefreshToken.create({ data: input });
	}

	async findByHash(tokenHash: string): Promise<McpRefreshTokenRecord | null> {
		return this.prisma.mcpRefreshToken.findUnique({ where: { tokenHash } });
	}

	/** 旧トークン失効 + 新トークン作成を同一トランザクションで実施（OAuth 2.1 回転）。 */
	async rotate(
		old: McpRefreshTokenRecord,
		newTokenHash: string,
		newExpiresAt: Date,
	): Promise<McpRefreshTokenRecord> {
		return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
			await tx.mcpRefreshToken.update({
				where: { id: old.id },
				data: { rotatedAt: new Date() },
			});

			return tx.mcpRefreshToken.create({
				data: {
					tokenHash: newTokenHash,
					clientId: old.clientId,
					userId: old.userId,
					scope: old.scope,
					expiresAt: newExpiresAt,
				},
			});
		});
	}

	async revoke(id: string): Promise<void> {
		await this.prisma.mcpRefreshToken.update({
			where: { id },
			data: { revokedAt: new Date() },
		});
	}
}
