import { IsEmail, IsString, MinLength } from 'class-validator';

export class ResetPasswordRequestDto {
	@IsEmail()
	email: string;
}

export class ResetPasswordDto {
	@IsString()
	token: string;

	@IsString()
	@MinLength(6)
	newPassword: string;
}

export class ChangePasswordDto {
	@IsString()
	@MinLength(6)
	currentPassword: string;

	@IsString()
	@MinLength(6)
	newPassword: string;
}
