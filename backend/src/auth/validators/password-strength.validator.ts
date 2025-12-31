import {
	registerDecorator,
	ValidationOptions,
	ValidationArguments,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from 'class-validator';

export interface PasswordStrengthOptions {
	minLength?: number;
	requireUppercase?: boolean;
	requireLowercase?: boolean;
	requireNumbers?: boolean;
	requireSpecialChars?: boolean;
}

@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
	validate(password: string, args: ValidationArguments): boolean {
		const options: PasswordStrengthOptions = (args.constraints[0] as PasswordStrengthOptions) || {};

		const minLength = options.minLength ?? 8;
		const requireUppercase = options.requireUppercase ?? true;
		const requireLowercase = options.requireLowercase ?? true;
		const requireNumbers = options.requireNumbers ?? true;
		const requireSpecialChars = options.requireSpecialChars ?? false;

		// 最小長チェック
		if (password.length < minLength) {
			return false;
		}

		// 大文字チェック
		if (requireUppercase && !/[A-Z]/.test(password)) {
			return false;
		}

		// 小文字チェック
		if (requireLowercase && !/[a-z]/.test(password)) {
			return false;
		}

		// 数字チェック
		if (requireNumbers && !/[0-9]/.test(password)) {
			return false;
		}

		// 特殊文字チェック
		if (requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
			return false;
		}

		return true;
	}

	defaultMessage(args: ValidationArguments): string {
		const options: PasswordStrengthOptions = (args.constraints[0] as PasswordStrengthOptions) || {};
		const minLength = options.minLength ?? 8;
		const requirements: string[] = [];

		requirements.push(`at least ${minLength} characters`);

		if (options.requireUppercase ?? true) {
			requirements.push('at least one uppercase letter');
		}

		if (options.requireLowercase ?? true) {
			requirements.push('at least one lowercase letter');
		}

		if (options.requireNumbers ?? true) {
			requirements.push('at least one number');
		}

		if (options.requireSpecialChars) {
			requirements.push('at least one special character');
		}

		return `Password must contain ${requirements.join(', ')}`;
	}
}

/**
 * カスタムデコレーター: パスワードの強度を検証
 *
 * @param options パスワード強度のオプション
 * @param validationOptions class-validatorのバリデーションオプション
 *
 * @example
 * ```typescript
 * class RegisterDto {
 *   @IsStrongPassword()
 *   password: string;
 * }
 * ```
 *
 * @example カスタム設定
 * ```typescript
 * class RegisterDto {
 *   @IsStrongPassword({ minLength: 10, requireSpecialChars: true })
 *   password: string;
 * }
 * ```
 */
export function IsStrongPassword(
	options?: PasswordStrengthOptions,
	validationOptions?: ValidationOptions,
) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			target: object.constructor,
			propertyName: propertyName,
			options: validationOptions,
			constraints: [options],
			validator: IsStrongPasswordConstraint,
		});
	};
}
