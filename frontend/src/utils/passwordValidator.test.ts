import { describe, it, expect } from 'vitest';
import {
	validatePasswordStrength,
	getPasswordStrengthScore,
	getPasswordStrengthColor,
	getPasswordStrengthLabel,
} from './passwordValidator';

/**
 * フロント / バックエンド共通のパスワード要件（8文字以上・大文字・小文字・数字、特殊文字は任意）。
 * backend/src/auth/validators/password-strength.validator.spec.ts に同じ表があり、
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

describe('validatePasswordStrength', () => {
	describe('共通ルール（バックエンドと一致すること）', () => {
		it.each(CONTRACT_CASES)('%s → isValid=%s（%s）', (password, isValid) => {
			expect(validatePasswordStrength(password).isValid).toBe(isValid);
		});
	});

	describe('エラーメッセージ', () => {
		it('満たしていない要件だけをエラーに挙げる', () => {
			expect(validatePasswordStrength('password').errors).toEqual([
				'少なくとも1つの大文字を含める必要があります',
				'少なくとも1つの数字を含める必要があります',
			]);
		});

		it('すべて満たしていればエラーは空になる', () => {
			expect(validatePasswordStrength('Passw0rd').errors).toEqual([]);
		});

		it('最小長のエラー文にオプションの値を反映する', () => {
			expect(validatePasswordStrength('Pw0', { minLength: 12 }).errors).toContain(
				'パスワードは12文字以上である必要があります',
			);
		});
	});

	describe('オプション上書き', () => {
		it('requireSpecialChars: true で特殊文字を必須にできる', () => {
			expect(validatePasswordStrength('Passw0rd', { requireSpecialChars: true }).isValid).toBe(
				false,
			);
			expect(validatePasswordStrength('P@ssw0rd', { requireSpecialChars: true }).isValid).toBe(
				true,
			);
		});

		it('requireUppercase: false で大文字要件を外せる', () => {
			expect(validatePasswordStrength('passw0rd', { requireUppercase: false }).isValid).toBe(true);
		});

		it('minLength を引き上げられる', () => {
			expect(validatePasswordStrength('Passw0rd', { minLength: 12 }).isValid).toBe(false);
		});
	});

	describe('strength', () => {
		it('要件を満たさなければ weak', () => {
			expect(validatePasswordStrength('password').strength).toBe('weak');
		});

		it('要件は満たすが 12 文字未満なら medium', () => {
			expect(validatePasswordStrength('P@ssw0rd').strength).toBe('medium');
		});

		it('12 文字以上でも特殊文字が無ければ medium', () => {
			expect(validatePasswordStrength('Passw0rdPassw0rd').strength).toBe('medium');
		});

		it('12 文字以上かつ特殊文字ありで strong', () => {
			expect(validatePasswordStrength('P@ssw0rdP@ssw0rd').strength).toBe('strong');
		});
	});
});

describe('getPasswordStrengthScore', () => {
	it('空文字は 0 点', () => {
		expect(getPasswordStrengthScore('')).toBe(0);
	});

	it('8 文字 + 小文字のみは 35 点（長さ20 + 小文字15）', () => {
		expect(getPasswordStrengthScore('abcdefgh')).toBe(35);
	});

	it('8 文字 + 大小文字 + 数字は 65 点', () => {
		expect(getPasswordStrengthScore('Abcdefg1')).toBe(65);
	});

	it('12 文字で長さボーナスが加算される', () => {
		expect(getPasswordStrengthScore('Abcdefgh1234')).toBe(75);
	});

	it('16 文字 + 全文字種で満点', () => {
		expect(getPasswordStrengthScore('P@ssw0rdP@ssw0rd')).toBe(100);
	});

	it('100 を超えない', () => {
		expect(getPasswordStrengthScore('P@ssw0rdP@ssw0rdP@ssw0rd')).toBe(100);
	});
});

describe('getPasswordStrengthColor', () => {
	it.each([
		['weak', 'text-red-600'],
		['medium', 'text-yellow-600'],
		['strong', 'text-green-600'],
	] as const)('%s → %s', (strength, expected) => {
		expect(getPasswordStrengthColor(strength)).toBe(expected);
	});
});

describe('getPasswordStrengthLabel', () => {
	it.each([
		['weak', '弱い'],
		['medium', '普通'],
		['strong', '強い'],
	] as const)('%s → %s', (strength, expected) => {
		expect(getPasswordStrengthLabel(strength)).toBe(expected);
	});
});
