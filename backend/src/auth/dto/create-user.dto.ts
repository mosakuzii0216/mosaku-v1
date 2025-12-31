import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';
import { IsStrongPassword } from '../validators/password-strength.validator';

export class CreateUserDto {
	@IsString()
	@IsOptional()
	name?: string;
}

export class RegisterUserDto {
	@IsEmail()
	email: string;

	@IsString()
	@IsStrongPassword({
		minLength: 8,
		requireUppercase: true,
		requireLowercase: true,
		requireNumbers: true,
		requireSpecialChars: false,
	})
	password: string;

	@IsString()
	@IsOptional()
	name?: string;

	@IsNotEmpty()
	@IsString()
	invitationCode: string;
}
