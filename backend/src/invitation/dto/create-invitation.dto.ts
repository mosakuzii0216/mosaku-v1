import {
	IsOptional,
	IsInt,
	IsDateString,
	Min,
	IsEnum,
	Validate,
	ValidatorConstraint,
	type ValidatorConstraintInterface,
	type ValidationArguments,
} from 'class-validator';
import { InvitationPerkType } from '@prisma/client';

// perkCompMonths の整合性をまとめて検証する単一ポイント
// COMP: 1〜3 の整数で必須（monetization.md: max 3 ヶ月 = ¥1500/人）
// NONE: 指定不可（undefined のみ）
@ValidatorConstraint({ name: 'perkCompMonthsConstraint', async: false })
class PerkCompMonthsConstraint implements ValidatorConstraintInterface {
	validate(value: number | undefined, args: ValidationArguments) {
		const o = args.object as { perkType?: InvitationPerkType };
		const perkType = o.perkType ?? InvitationPerkType.NONE;

		if (perkType === InvitationPerkType.COMP) {
			return value !== undefined && Number.isInteger(value) && value >= 1 && value <= 3;
		}
		return value === undefined;
	}

	defaultMessage(args: ValidationArguments) {
		const o = args.object as { perkType?: InvitationPerkType };
		if (o.perkType === InvitationPerkType.COMP) {
			return 'COMP の付与月数は 1〜3 ヶ月です';
		}
		return 'perkCompMonths は perkType が COMP のときのみ指定できます';
	}
}

export class CreateInvitationDto {
	@IsOptional()
	@IsInt()
	@Min(1)
	maxUses?: number = 1;

	@IsOptional()
	@IsDateString()
	expiresAt?: string;

	// backend と同期: InvitationPerkType enum（NONE / COMP）
	@IsOptional()
	@IsEnum(InvitationPerkType)
	perkType?: InvitationPerkType = InvitationPerkType.NONE;

	// PerkCompMonthsConstraint が COMP/NONE の整合性を一括検証
	@Validate(PerkCompMonthsConstraint)
	perkCompMonths?: number;
}
