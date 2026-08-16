import { Inject, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { InvitationPerkType, Prisma, type InvitationCode } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ERROR_CODES, throwBadRequest, throwNotFound } from '../common/exceptions';
import { AuthorizationService } from '../common/services/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { PerkGate, type InvitationPerkView } from './perk-gate';
import { MAX_ACTIVE_INVITE_CODES } from './constants';
import { CODE_GENERATOR, type CodeGenerator } from './utils/code-generator';
import { QUOTA_POLICY, type QuotaPolicy } from './utils/quota-policy';

export interface InvitationCreator {
	id: string;
	name: string | null;
	maskedId: string;
}

export interface InvitationContext {
	code: string;
	status: 'valid';
	creator: InvitationCreator;
	expiresAt: Date | null;
	usesRemaining: number;
	perk: InvitationPerkView;
}

export interface UserQuotaSnapshot {
	invitationQuota: number;
	unlimited: boolean;
	role: 'USER' | 'ADMIN';
}

export interface QuotaActor {
	id: string;
	role: 'USER' | 'ADMIN';
}

export interface CreateCampaignOptions {
	maxUses?: number;
}

const CREATE_RETRY_LIMIT = 3;

function maskCreatorId(createdById: string): string {
	return `${createdById.slice(0, 4)}***`;
}

@Injectable()
export class InvitationService {
	constructor(
		private prisma: PrismaService,
		private authorizationService: AuthorizationService,
		@Inject(CODE_GENERATOR) private codeGenerator: CodeGenerator,
		@Inject(QUOTA_POLICY) private quotaPolicy: QuotaPolicy,
		private perkGate: PerkGate,
	) {}

	async createInvitation(createInvitationDto: CreateInvitationDto, createdById: string) {
		const code = this.generateLegacyInvitationCode();
		const perkType = createInvitationDto.perkType ?? InvitationPerkType.NONE;
		let perkCompMonths: number | null = null;

		if (perkType === InvitationPerkType.COMP) {
			const months = createInvitationDto.perkCompMonths;
			if (months === undefined || months === null || months < 1 || months > 3) {
				throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT);
			}
			perkCompMonths = months!;
			Sentry.addBreadcrumb({
				message: 'ADMIN issued COMP invitation code',
				level: 'info',
				data: { createdById, perkCompMonths },
				type: 'default',
			});
		} else if (
			createInvitationDto.perkCompMonths !== undefined &&
			createInvitationDto.perkCompMonths !== null
		) {
			throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT);
		}

		return this.prisma.invitationCode.create({
			data: {
				code,
				maxUses: createInvitationDto.maxUses || 1,
				expiresAt: createInvitationDto.expiresAt ? new Date(createInvitationDto.expiresAt) : null,
				createdById,
				perkType,
				perkCompMonths,
			},
		});
	}

	async findValidInvitation(code: string): Promise<InvitationCode> {
		const invitation = await this.prisma.invitationCode.findUnique({
			where: { code },
		});

		if (!invitation) {
			throwBadRequest(ERROR_CODES.INVITATION.INVALID_CODE);
		}

		if (invitation.expiresAt && invitation.expiresAt < new Date()) {
			throwBadRequest(ERROR_CODES.INVITATION.EXPIRED);
		}

		if (invitation.usedCount >= invitation.maxUses) {
			throwBadRequest(ERROR_CODES.INVITATION.MAX_USES_REACHED);
		}

		return invitation;
	}

	async verifyInvitation(code: string): Promise<InvitationContext> {
		const invitation = await this.findValidInvitation(code);
		const user = await this.prisma.user.findUnique({
			where: { id: invitation.createdById },
			select: { id: true, name: true },
		});

		return {
			code: invitation.code,
			status: 'valid',
			creator: {
				id: user?.id ?? invitation.createdById,
				name: user?.name ?? null,
				maskedId: maskCreatorId(invitation.createdById),
			},
			expiresAt: invitation.expiresAt,
			usesRemaining: invitation.maxUses - invitation.usedCount,
			perk: this.perkGate.resolvePerk(invitation),
		};
	}

	async useInvitation(code: string): Promise<void> {
		const invitation = await this.findValidInvitation(code);
		await this.prisma.invitationCode.update({
			where: { id: invitation.id },
			data: { usedCount: invitation.usedCount + 1 },
		});
	}

	async createForUser(actor: QuotaActor, options?: CreateCampaignOptions): Promise<InvitationCode> {
		const maxUses = options?.maxUses ?? 1;
		let lastError: unknown = null;

		for (let attempt = 0; attempt < CREATE_RETRY_LIMIT; attempt++) {
			try {
				return await this.prisma.$transaction(async (tx) => {
					// USER のみ: 同時有効コード数（未失効かつ usedCount < maxUses）を確認
					if (actor.role === 'USER') {
						const activeCodes = await tx.invitationCode.findMany({
							where: {
								createdById: actor.id,
								OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
							},
							select: { usedCount: true, maxUses: true },
						});
						const activeCount = activeCodes.filter((c) => c.usedCount < c.maxUses).length;
						if (activeCount >= MAX_ACTIVE_INVITE_CODES) {
							throwBadRequest(ERROR_CODES.VALIDATION.INVALID_INPUT);
						}
					}

					const decision = await this.quotaPolicy.evaluateAndConsume(tx, actor);
					if (!decision.allowed) {
						throwBadRequest(decision.code);
					}

					const code = this.codeGenerator.generate();
					return tx.invitationCode.create({
						data: {
							code,
							maxUses,
							perkType: InvitationPerkType.NONE,
							createdById: actor.id,
						},
					});
				});
			} catch (err) {
				if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
					lastError = err;
					continue;
				}
				throw err;
			}
		}

		throw lastError instanceof Error
			? lastError
			: new Error('Failed to create invitation after retries');
	}

	async getMyInvitations(userId: string): Promise<InvitationCode[]> {
		return this.prisma.invitationCode.findMany({
			where: { createdById: userId },
			orderBy: { createdAt: 'desc' },
		});
	}

	async getMyQuota(userId: string): Promise<UserQuotaSnapshot> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { invitationQuota: true, role: true },
		});

		if (!user) {
			throwNotFound(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		const role: 'USER' | 'ADMIN' = user.role === 'ADMIN' ? 'ADMIN' : 'USER';

		return {
			invitationQuota: user.invitationQuota,
			unlimited: role === 'ADMIN',
			role,
		};
	}

	async deleteMyInvitation(id: string, ownerId: string): Promise<void> {
		const invitation = await this.prisma.invitationCode.findUnique({ where: { id } });

		this.authorizationService.validateOwnership(
			invitation ? { ...invitation, userId: invitation.createdById } : null,
			ownerId,
			'Invitation',
		);

		await this.prisma.invitationCode.delete({ where: { id } });
	}

	async getInvitations(createdById: string) {
		return this.prisma.invitationCode.findMany({
			where: { createdById },
			orderBy: { createdAt: 'desc' },
		});
	}

	async getAllInvitations() {
		return this.prisma.invitationCode.findMany({
			orderBy: { createdAt: 'desc' },
		});
	}

	async deleteInvitation(id: string, createdById: string) {
		const invitation = await this.prisma.invitationCode.findFirst({
			where: { id, createdById },
		});

		if (!invitation) {
			throwBadRequest(ERROR_CODES.INVITATION.NOT_FOUND);
		}

		return this.prisma.invitationCode.delete({
			where: { id },
		});
	}

	async deleteAnyInvitation(id: string) {
		const invitation = await this.prisma.invitationCode.findUnique({
			where: { id },
		});

		if (!invitation) {
			throwBadRequest(ERROR_CODES.INVITATION.NOT_FOUND);
		}

		return this.prisma.invitationCode.delete({
			where: { id },
		});
	}

	private generateLegacyInvitationCode(): string {
		return randomBytes(16).toString('hex').toUpperCase();
	}
}
