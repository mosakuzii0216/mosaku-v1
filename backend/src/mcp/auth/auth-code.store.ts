import { Injectable } from '@nestjs/common';
import type { McpAuthCode, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AuthCodeRecord = McpAuthCode;

export interface AuthCodeCreateInput {
	code: string;
	clientId: string;
	userId: string;
	redirectUri: string;
	codeChallenge: string;
	scope: string;
	resource: string;
	expiresAt: Date;
}

@Injectable()
export class AuthCodeStore {
	constructor(private readonly prisma: PrismaService) {}

	async create(input: AuthCodeCreateInput): Promise<AuthCodeRecord> {
		return this.prisma.mcpAuthCode.create({
			data: {
				code: input.code,
				clientId: input.clientId,
				userId: input.userId,
				redirectUri: input.redirectUri,
				codeChallenge: input.codeChallenge,
				codeChallengeMethod: 'S256',
				scope: input.scope,
				resource: input.resource,
				expiresAt: input.expiresAt,
			},
		});
	}

	/** 認可コードを原子的に1回だけ消費する。存在しない・期限切れは null を返す。 */
	async findAndConsume(code: string): Promise<AuthCodeRecord | null> {
		return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
			const record = await tx.mcpAuthCode.findUnique({ where: { code } });
			if (!record) return null;
			if (record.expiresAt.getTime() < Date.now()) return null;

			await tx.mcpAuthCode.delete({ where: { code } });
			return record;
		});
	}
}
