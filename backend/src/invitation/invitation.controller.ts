import {
	Controller,
	Get,
	Post,
	Delete,
	Body,
	Param,
	UseGuards,
	Request,
} from '@nestjs/common';
import { ERROR_CODES, throwBadRequest, throwNotFound } from '../common/exceptions';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { VerifyInvitationDto } from './dto/verify-invitation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest, AuthenticatedUser } from '../auth/types';

@Controller('invitation')
export class InvitationController {
	constructor(
		private readonly invitationService: InvitationService,
		private readonly prisma: PrismaService,
	) {}

	private async getLocalUser(jwtUser: AuthenticatedUser) {
		const user = await this.prisma.user.findUnique({
			where: { id: jwtUser.id },
		});

		if (!user) {
			throwNotFound(ERROR_CODES.AUTH.USER_NOT_FOUND);
		}

		return user;
	}

	@Post()
	@UseGuards(JwtAuthGuard)
	async createInvitation(
		@Body() createInvitationDto: CreateInvitationDto,
		@Request() req: AuthenticatedRequest,
	) {
		// Get local user data to check role
		const localUser = await this.getLocalUser(req.user);

		// Only admin users can create invitations
		if (localUser.role !== 'ADMIN') {
			throwBadRequest(ERROR_CODES.AUTHZ.ADMIN_ONLY);
		}

		return this.invitationService.createInvitation(createInvitationDto, localUser.id);
	}

	@Post('verify')
	async verifyInvitation(@Body() verifyInvitationDto: VerifyInvitationDto) {
		return this.invitationService.verifyInvitation(verifyInvitationDto.code);
	}

	@Get()
	@UseGuards(JwtAuthGuard)
	async getInvitations(@Request() req: AuthenticatedRequest) {
		// Get local user data to check role
		const localUser = await this.getLocalUser(req.user);

		// Only admin users can view invitations
		if (localUser.role !== 'ADMIN') {
			throwBadRequest(ERROR_CODES.AUTHZ.ADMIN_ONLY);
		}

		return this.invitationService.getAllInvitations();
	}

	@Delete(':id')
	@UseGuards(JwtAuthGuard)
	async deleteInvitation(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
		// Get local user data to check role
		const localUser = await this.getLocalUser(req.user);

		// Only admin users can delete invitations
		if (localUser.role !== 'ADMIN') {
			throwBadRequest(ERROR_CODES.AUTHZ.ADMIN_ONLY);
		}

		return this.invitationService.deleteAnyInvitation(id);
	}
}
