import { validate } from 'class-validator';
import type { ValidationArguments } from 'class-validator';
import {
	IsStrongPasswordConstraint,
	type PasswordStrengthOptions,
} from './password-strength.validator';
import { RegisterUserDto } from '../dto/create-user.dto';

const argsWith = (options?: PasswordStrengthOptions): ValidationArguments =>
	({ constraints: [options] }) as ValidationArguments;

/** constraints が空配列（デコレーターに引数を渡していない状態）の ValidationArguments。 */
const argsWithoutConstraints = { constraints: [] } as unknown as ValidationArguments;

/**
 * フロント / バックエンド共通のパスワード要件（8文字以上・大文字・小文字・数字、特殊文字は任意）。
 * frontend/src/utils/passwordValidator.test.ts に同じ表があり、
 * 両者が同じ判定になることでルールのドリフトを検出する。
 */
const CONTRACT_CASES: ReadonlyArray<[password: string, isValid: boolean, reason: string]> = [
	['Passw0rd', true, '8文字・大文字・小文字・数字をすべて満たす'],
	['P@ssw0rd', true, '特殊文字はあっても構わない'],
	['Passw0rdPassw0rd', true, '長いパスワードも通る'],
	['Passw0r', false, '7文字で最小長に満たない'],
	['passw0rd', false, '大文字が無い'],
	['PASSW0RD', false, '小文字が無い'],
	['Password', false, '数字が無い'],
	['', false, '空文字'],
];

describe('IsStrongPasswordConstraint', () => {
	const constraint = new IsStrongPasswordConstraint();

	describe('validate() — 共通ルール（フロントエンドと一致すること）', () => {
		it.each(CONTRACT_CASES)('%s → %s（%s）', (password, isValid) => {
			expect(constraint.validate(password, argsWith())).toBe(isValid);
		});

		it('constraints が未指定でもデフォルト要件で判定する', () => {
			expect(constraint.validate('Passw0rd', argsWithoutConstraints)).toBe(true);
			expect(constraint.validate('password', argsWithoutConstraints)).toBe(false);
		});
	});

	describe('validate() — オプション上書き', () => {
		it('requireSpecialChars: true で特殊文字を必須にできる', () => {
			expect(constraint.validate('Passw0rd', argsWith({ requireSpecialChars: true }))).toBe(false);
			expect(constraint.validate('P@ssw0rd', argsWith({ requireSpecialChars: true }))).toBe(true);
		});

		it('requireUppercase: false で大文字要件を外せる', () => {
			expect(constraint.validate('passw0rd', argsWith({ requireUppercase: false }))).toBe(true);
		});

		it('requireLowercase: false で小文字要件を外せる', () => {
			expect(constraint.validate('PASSW0RD', argsWith({ requireLowercase: false }))).toBe(true);
		});

		it('requireNumbers: false で数字要件を外せる', () => {
			expect(constraint.validate('Password', argsWith({ requireNumbers: false }))).toBe(true);
		});

		it('minLength を引き上げられる', () => {
			expect(constraint.validate('Passw0rd', argsWith({ minLength: 12 }))).toBe(false);
			expect(constraint.validate('Passw0rdPassw0rd', argsWith({ minLength: 12 }))).toBe(true);
		});
	});

	describe('defaultMessage()', () => {
		it('デフォルト要件を列挙する（特殊文字は含めない）', () => {
			expect(constraint.defaultMessage(argsWith())).toBe(
				'Password must contain at least 8 characters, at least one uppercase letter, at least one lowercase letter, at least one number',
			);
		});

		it('requireSpecialChars: true のときだけ特殊文字要件を足す', () => {
			expect(constraint.defaultMessage(argsWith({ requireSpecialChars: true }))).toContain(
				'at least one special character',
			);
		});

		it('外した要件は文面からも消える', () => {
			const message = constraint.defaultMessage(
				argsWith({ minLength: 12, requireUppercase: false }),
			);

			expect(message).toContain('at least 12 characters');
			expect(message).not.toContain('uppercase');
		});
	});
});

describe('@IsStrongPassword() デコレーター経由の DTO 検証', () => {
	const buildDto = (password: string) => {
		const dto = new RegisterUserDto();
		dto.email = 'user@example.com';
		dto.password = password;
		dto.invitationCode = 'CODE1234';
		return dto;
	};

	it('要件を満たすパスワードは password のエラーを出さない', async () => {
		const errors = await validate(buildDto('Passw0rd'));

		expect(errors.find((error) => error.property === 'password')).toBeUndefined();
	});

	it('要件を満たさないパスワードは password のエラーを出す', async () => {
		const errors = await validate(buildDto('weak'));
		const passwordError = errors.find((error) => error.property === 'password');

		expect(passwordError).toBeDefined();
		expect(Object.values(passwordError!.constraints ?? {}).join(' ')).toContain(
			'Password must contain at least 8 characters',
		);
	});
});
