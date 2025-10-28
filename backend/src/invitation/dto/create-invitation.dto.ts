import { IsOptional, IsInt, IsDateString, Min } from 'class-validator';

export class CreateInvitationDto {
	@IsOptional()
	@IsInt()
	@Min(1)
	maxUses?: number = 1;

	@IsOptional()
	@IsDateString()
	expiresAt?: string;
}
