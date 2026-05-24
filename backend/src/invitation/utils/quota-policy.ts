import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES } from '../../common/exceptions';

export type QuotaPolicyTransactionClient = Pick<Prisma.TransactionClient, 'user'>;

export interface QuotaActor {
	id: string;
	role: 'USER' | 'ADMIN';
}

export interface QuotaDecisionAllowed {
	allowed: true;
	consumed: boolean;
}

export interface QuotaDecisionDenied {
	allowed: false;
	code: typeof ERROR_CODES.INVITATION.QUOTA_EXHAUSTED;
}

export type QuotaDecision = QuotaDecisionAllowed | QuotaDecisionDenied;

export interface QuotaPolicy {
	evaluateAndConsume(tx: QuotaPolicyTransactionClient, actor: QuotaActor): Promise<QuotaDecision>;
}

export const QUOTA_POLICY: unique symbol = Symbol('QUOTA_POLICY');

@Injectable()
export class PrismaQuotaPolicy implements QuotaPolicy {
	async evaluateAndConsume(
		tx: QuotaPolicyTransactionClient,
		actor: QuotaActor,
	): Promise<QuotaDecision> {
		if (actor.role === 'ADMIN') {
			return { allowed: true, consumed: false };
		}

		const result = await tx.user.updateMany({
			where: {
				id: actor.id,
				role: 'USER',
				invitationQuota: { gt: 0 },
			},
			data: {
				invitationQuota: { decrement: 1 },
			},
		});

		if (result.count === 0) {
			return { allowed: false, code: ERROR_CODES.INVITATION.QUOTA_EXHAUSTED };
		}

		return { allowed: true, consumed: true };
	}
}
