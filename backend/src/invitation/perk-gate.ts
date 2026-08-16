import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { InvitationPerkType } from '@prisma/client';
import { ConfigService } from '../config/config.service';

export type InvitationPerkView = { type: 'none' } | { type: 'comp'; months: number };

// 本 spec の PerkGate は resolvePerk のみを公開する。
// COMP 適用本体（applyPerk / PerkApplier）は課金ウォレット基盤に依存するため後続 spec で追加・配線する。
@Injectable()
export class PerkGate {
	constructor(private configService: ConfigService) {}

	resolvePerk(invitation: {
		perkType: InvitationPerkType;
		perkCompMonths: number | null;
	}): InvitationPerkView {
		if (!this.configService.compPerkEnabled) {
			return { type: 'none' };
		}

		if (invitation.perkType === 'COMP') {
			const months = invitation.perkCompMonths;
			if (months === null || months < 1 || months > 3) {
				Sentry.captureMessage('PerkGate: invalid perkCompMonths — fallback to none', {
					level: 'warning',
					tags: { feature_area: 'invitation' },
					extra: { perkCompMonths: months },
				});
				return { type: 'none' };
			}
			return { type: 'comp', months };
		}

		return { type: 'none' };
	}
}
