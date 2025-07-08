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
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { VerifyInvitationDto } from './dto/verify-invitation.dto';
import { SupabaseGuard } from '../auth/supabase.guard';

@Controller('invitation')
@UseGuards(SupabaseGuard)
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post()
  async createInvitation(
    @Body() createInvitationDto: CreateInvitationDto,
    @Request() req: any,
  ) {
    // Only admin users can create invitations
    if (req.user.role !== 'ADMIN') {
      throw new BadRequestException('Only admin users can create invitations');
    }

    return this.invitationService.createInvitation(
      createInvitationDto,
      req.user.id,
    );
  }

  @Post('verify')
  async verifyInvitation(@Body() verifyInvitationDto: VerifyInvitationDto) {
    return this.invitationService.verifyInvitation(verifyInvitationDto.code);
  }

  @Get()
  async getInvitations(@Request() req: any) {
    // Only admin users can view invitations
    if (req.user.role !== 'ADMIN') {
      throw new BadRequestException('Only admin users can view invitations');
    }

    return this.invitationService.getInvitations(req.user.id);
  }

  @Delete(':id')
  async deleteInvitation(@Param('id') id: string, @Request() req: any) {
    // Only admin users can delete invitations
    if (req.user.role !== 'ADMIN') {
      throw new BadRequestException('Only admin users can delete invitations');
    }

    return this.invitationService.deleteInvitation(id, req.user.id);
  }
}
