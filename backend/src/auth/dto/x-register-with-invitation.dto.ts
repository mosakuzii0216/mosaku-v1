import { IsNotEmpty, IsObject, IsString } from 'class-validator'

export class XRegisterWithInvitationDto {
  @IsObject()
  xUser!: Record<string, unknown>

  @IsString()
  @IsNotEmpty()
  invitationCode!: string
}

