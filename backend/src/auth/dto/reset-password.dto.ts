import { IsEmail, IsString } from 'class-validator';
import { IsStrongPassword } from '../validators/password-strength.validator';

export class ResetPasswordRequestDto {
	@IsEmail()
	email: string;
}

export class ResetPasswordDto {
	@IsString()
	token: string;

	@IsString()
	@IsStrongPassword({
		minLength: 8,
		requireUppercase: true,
		requireLowercase: true,
		requireNumbers: true,
		requireSpecialChars: false,
	})
	newPassword: string;
}

export class ChangePasswordDto {
	@IsString()
	currentPassword: string;

	@IsString()
	@IsStrongPassword({
		minLength: 8,
		requireUppercase: true,
		requireLowercase: true,
		requireNumbers: true,
		requireSpecialChars: false,
	})
	newPassword: string;
}
