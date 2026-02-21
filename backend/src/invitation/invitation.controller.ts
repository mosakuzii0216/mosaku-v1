import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { VerifyInvitationDto } from './dto/verify-invitation.dto';
import { AdminGuard } from '../common/guards/admin.guard';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../auth/types';

@Controller('invitation')
export class InvitationController {
	constructor(private readonly invitationService: InvitationService) {}

	/**
	 * 招待コードを作成（ADMIN 専用）
	 * POST /invitation
	 */
	@Post()
	@UseGuards(AdminGuard)
	async createInvitation(
		@Body() createInvitationDto: CreateInvitationDto,
		@Request() req: AuthenticatedRequest,
	) {
		return this.invitationService.createInvitation(createInvitationDto, req.user.id);
	}

	/**
	 * 招待コードを検証（認証不要）
	 * POST /invitation/verify
	 */
	@Public()
	@Post('verify')
	async verifyInvitation(@Body() verifyInvitationDto: VerifyInvitationDto) {
		return this.invitationService.verifyInvitation(verifyInvitationDto.code);
	}

	/**
	 * 招待コード一覧を取得（ADMIN 専用）
	 * GET /invitation
	 */
	@Get()
	@UseGuards(AdminGuard)
	async getInvitations() {
		return this.invitationService.getAllInvitations();
	}

	/**
	 * 招待コードを削除（ADMIN 専用）
	 * DELETE /invitation/:id
	 */
	@Delete(':id')
	@UseGuards(AdminGuard)
	async deleteInvitation(@Param('id') id: string) {
		return this.invitationService.deleteAnyInvitation(id);
	}
}
