import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class GithubRegisterWithInvitationDto {
	@IsObject()
	githubUser!: Record<string, unknown>;

	@IsString()
	@IsNotEmpty()
	invitationCode!: string;
}
