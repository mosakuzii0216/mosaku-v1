import {
  IsString,
  IsOptional,
  IsEmail,
  MinLength,
  IsNotEmpty,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsOptional()
  name?: string;
}

export class RegisterUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNotEmpty()
  @IsString()
  invitationCode: string;
}
