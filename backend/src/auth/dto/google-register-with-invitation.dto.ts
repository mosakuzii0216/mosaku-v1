import { IsNotEmpty, IsObject, IsString } from 'class-validator'

export class GoogleRegisterWithInvitationDto {
  @IsObject()
  googleUser!: Record<string, unknown>

  @IsString()
  @IsNotEmpty()
  invitationCode!: string
}

