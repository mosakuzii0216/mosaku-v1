import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class LineRegisterWithInvitationDto {
	@IsObject()
	lineUser!: Record<string, unknown>;

	@IsString()
	@IsNotEmpty()
	invitationCode!: string;
}
