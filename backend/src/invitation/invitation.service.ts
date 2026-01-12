import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { randomBytes } from 'crypto';
import { ERROR_CODES, throwBadRequest } from '../common/exceptions';

@Injectable()
export class InvitationService {
	constructor(private prisma: PrismaService) {}

	async createInvitation(createInvitationDto: CreateInvitationDto, createdById: string) {
		const code = this.generateInvitationCode();

		return this.prisma.invitationCode.create({
			data: {
				code,
				maxUses: createInvitationDto.maxUses || 1,
				expiresAt: createInvitationDto.expiresAt ? new Date(createInvitationDto.expiresAt) : null,
				createdById,
			},
		});
	}

	async verifyInvitation(code: string) {
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

	async useInvitation(code: string) {
		const invitation = await this.verifyInvitation(code);

		return this.prisma.invitationCode.update({
			where: { id: invitation.id },
			data: { usedCount: invitation.usedCount + 1 },
		});
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

	private generateInvitationCode(): string {
		return randomBytes(16).toString('hex').toUpperCase();
	}
}
