import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { randomBytes } from 'crypto';

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
			throw new BadRequestException('Invalid invitation code');
		}

		if (invitation.expiresAt && invitation.expiresAt < new Date()) {
			throw new BadRequestException('Invitation code has expired');
		}

		if (invitation.usedCount >= invitation.maxUses) {
			throw new BadRequestException('Invitation code has been used maximum times');
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
			throw new BadRequestException('Invitation not found');
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
			throw new BadRequestException('Invitation not found');
		}

		return this.prisma.invitationCode.delete({
			where: { id },
		});
	}

	private generateInvitationCode(): string {
		return randomBytes(16).toString('hex').toUpperCase();
	}
}
