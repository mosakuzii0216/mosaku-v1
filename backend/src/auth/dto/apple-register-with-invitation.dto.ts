import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class AppleRegisterWithInvitationDto {
	@IsObject()
	appleUser!: Record<string, unknown>;

	@IsString()
	@IsNotEmpty()
	invitationCode!: string;

	@IsEmail()
	@IsOptional()
	fallbackEmail?: string;
}
