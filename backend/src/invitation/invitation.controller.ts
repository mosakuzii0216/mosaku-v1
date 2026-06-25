import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { InvitationCode } from '@prisma/client';
import { ConfigService } from '../config/config.service';
import {
	InvitationService,
	type InvitationContext,
	type UserQuotaSnapshot,
} from './invitation.service';
import { type InvitationPerkView } from './perk-gate';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CreateMyInvitationDto } from './dto/create-my-invitation.dto';
import { VerifyInvitationDto } from './dto/verify-invitation.dto';
import { VerifyInvitationContextDto } from './dto/verify-invitation-context.dto';
import { AdminGuard } from '../common/guards/admin.guard';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../auth/types';

export interface InvitationContextResponse {
	code: string;
	status: 'valid';
	creator: { name: string | null; maskedId: string };
	expiresAt: string | null;
	usesRemaining: number;
	perk: InvitationPerkView;
}

export interface InvitationVerificationResponse {
	code: string;
	maxUses: number;
	usedCount: number;
	expiresAt: string | null;
}

export interface InvitationWithShareUrlResponse {
	id: string;
	code: string;
	shareUrl: string;
	maxUses: number;
	usedCount: number;
	expiresAt: string | null;
	createdAt: string;
}

export interface UserQuotaResponse {
	invitationQuota: number;
	unlimited: boolean;
	role: 'USER' | 'ADMIN';
}

@Controller('invitation')
export class InvitationController {
	constructor(
		private readonly invitationService: InvitationService,
		private readonly configService: ConfigService,
	) {}

	/**
	 * 招待コードを作成（ADMIN 専用）
	 * POST /invitation
	 */
	@Post()
	@UseGuards(AdminGuard)
	async createInvitation(
		@Body() createInvitationDto: CreateInvitationDto,
		@Request() req: AuthenticatedRequest,
	): Promise<InvitationWithShareUrlResponse> {
		const invitation = await this.invitationService.createInvitation(
			createInvitationDto,
			req.user.id,
		);
		return this.toInvitationWithShareUrl(invitation);
	}

	/**
	 * 招待コードを検証（認証不要・旧 API 互換維持）
	 * POST /invitation/verify
	 */
	@Public()
	@Post('verify')
	async verifyInvitation(
		@Body() verifyInvitationDto: VerifyInvitationDto,
	): Promise<InvitationVerificationResponse> {
		const invitation = await this.invitationService.findValidInvitation(verifyInvitationDto.code);
		return this.toInvitationVerificationResponse(invitation);
	}

	/**
	 * 招待コードを検証して招待者文脈を返却（受信者向け、認証不要）
	 * POST /invitation/verify-context
	 * @Throttle で 30 req/60s/IP のブルートフォース耐性
	 */
	@Public()
	@Throttle({ default: { limit: 30, ttl: 60_000 } })
	@Post('verify-context')
	async verifyInvitationContext(
		@Body() dto: VerifyInvitationContextDto,
	): Promise<InvitationContextResponse> {
		const context = await this.invitationService.verifyInvitation(dto.code);
		return this.toInvitationContextResponse(context);
	}

	/**
	 * 自分の招待コードを発行（maxUses 可変キャンペーン対応）
	 * POST /invitation/me
	 */
	@Post('me')
	async createMyInvitation(
		@Body() dto: CreateMyInvitationDto,
		@Request() req: AuthenticatedRequest,
	): Promise<InvitationWithShareUrlResponse> {
		const actor = { id: req.user.id, role: req.user.role };
		const invitation = await this.invitationService.createForUser(actor, {
			maxUses: dto.maxUses ?? 1,
		});
		return this.toInvitationWithShareUrl(invitation);
	}

	/**
	 * 自分が発行した招待コード一覧
	 * GET /invitation/me
	 */
	@Get('me')
	async getMyInvitations(
		@Request() req: AuthenticatedRequest,
	): Promise<InvitationWithShareUrlResponse[]> {
		const invitations = await this.invitationService.getMyInvitations(req.user.id);
		return invitations.map((inv) => this.toInvitationWithShareUrl(inv));
	}

	/**
	 * 自分の招待 quota 残数
	 * GET /invitation/me/quota
	 */
	@Get('me/quota')
	async getMyQuota(@Request() req: AuthenticatedRequest): Promise<UserQuotaResponse> {
		const snapshot: UserQuotaSnapshot = await this.invitationService.getMyQuota(req.user.id);
		return snapshot;
	}

	/**
	 * 自分の招待コードを削除（所有権チェックは Service 層で実施）
	 * DELETE /invitation/me/:id
	 */
	@Delete('me/:id')
	async deleteMyInvitation(
		@Param('id') id: string,
		@Request() req: AuthenticatedRequest,
	): Promise<void> {
		await this.invitationService.deleteMyInvitation(id, req.user.id);
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

	/**
	 * `{FRONTEND_URL}/invite/{code}` を末尾スラッシュ重複なしで組み立てる
	 */
	private buildShareUrl(code: string): string {
		const base = this.configService.frontendUrl.replace(/\/+$/, '');
		return `${base}/invite/${code}`;
	}

	private toInvitationWithShareUrl(invitation: InvitationCode): InvitationWithShareUrlResponse {
		return {
			id: invitation.id,
			code: invitation.code,
			shareUrl: this.buildShareUrl(invitation.code),
			maxUses: invitation.maxUses,
			usedCount: invitation.usedCount,
			expiresAt: invitation.expiresAt ? invitation.expiresAt.toISOString() : null,
			createdAt: invitation.createdAt.toISOString(),
		};
	}

	private toInvitationContextResponse(context: InvitationContext): InvitationContextResponse {
		return {
			code: context.code,
			status: context.status,
			creator: {
				name: context.creator.name,
				maskedId: context.creator.maskedId,
			},
			expiresAt: context.expiresAt ? context.expiresAt.toISOString() : null,
			usesRemaining: context.usesRemaining,
			perk: context.perk,
		};
	}

	private toInvitationVerificationResponse(
		invitation: InvitationCode,
	): InvitationVerificationResponse {
		return {
			code: invitation.code,
			maxUses: invitation.maxUses,
			usedCount: invitation.usedCount,
			expiresAt: invitation.expiresAt ? invitation.expiresAt.toISOString() : null,
		};
	}
}
