import {
	Controller,
	Get,
	Post,
	Delete,
	Body,
	Param,
	UseGuards,
	Request,
	BadRequestException,
	NotFoundException,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { VerifyInvitationDto } from './dto/verify-invitation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('invitation')
export class InvitationController {
	constructor(
		private readonly invitationService: InvitationService,
		private readonly prisma: PrismaService,
	) {}

	private async getLocalUser(jwtUser: any) {
		const user = await this.prisma.user.findUnique({
			where: { id: jwtUser.id },
		});

		if (!user) {
			throw new NotFoundException('User not found in local database');
		}

		return user;
	}

	@Post()
	@UseGuards(JwtAuthGuard)
	async createInvitation(@Body() createInvitationDto: CreateInvitationDto, @Request() req: any) {
		// Get local user data to check role
		const localUser = await this.getLocalUser(req.user);

		// Only admin users can create invitations
		if (localUser.role !== 'ADMIN') {
			throw new BadRequestException('Only admin users can create invitations');
		}

		return this.invitationService.createInvitation(createInvitationDto, localUser.id);
	}

	@Post('verify')
	async verifyInvitation(@Body() verifyInvitationDto: VerifyInvitationDto) {
		return this.invitationService.verifyInvitation(verifyInvitationDto.code);
	}

	@Get()
	@UseGuards(JwtAuthGuard)
	async getInvitations(@Request() req: any) {
		// Get local user data to check role
		const localUser = await this.getLocalUser(req.user);

		// Only admin users can view invitations
		if (localUser.role !== 'ADMIN') {
			throw new BadRequestException('Only admin users can view invitations');
		}

		return this.invitationService.getAllInvitations();
	}

	@Delete(':id')
	@UseGuards(JwtAuthGuard)
	async deleteInvitation(@Param('id') id: string, @Request() req: any) {
		// Get local user data to check role
		const localUser = await this.getLocalUser(req.user);

		// Only admin users can delete invitations
		if (localUser.role !== 'ADMIN') {
			throw new BadRequestException('Only admin users can delete invitations');
		}

		return this.invitationService.deleteAnyInvitation(id);
	}
}
