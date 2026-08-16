import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { MAX_CAMPAIGN_MAX_USES } from '../constants';

export class CreateMyInvitationDto {
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(MAX_CAMPAIGN_MAX_USES)
	maxUses?: number = 1;
}
