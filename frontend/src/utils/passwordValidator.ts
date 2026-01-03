/**
 * パスワード強度の検証結果
 */
export interface PasswordValidationResult {
	isValid: boolean;
	errors: string[];
	strength: 'weak' | 'medium' | 'strong';
}

/**
 * パスワード強度検証のオプション
 */
export interface PasswordStrengthOptions {
	minLength?: number;
	requireUppercase?: boolean;
	requireLowercase?: boolean;
	requireNumbers?: boolean;
	requireSpecialChars?: boolean;
}

/**
 * デフォルトのパスワード要件（バックエンドと一致）
 */
const DEFAULT_OPTIONS: Required<PasswordStrengthOptions> = {
	minLength: 8,
	requireUppercase: true,
	requireLowercase: true,
	requireNumbers: true,
	requireSpecialChars: false,
};

/**
 * パスワードの強度を検証する
 *
 * @param password 検証するパスワード
 * @param options カスタムオプション（オプショナル）
 * @returns 検証結果
 *
 * @example
 * ```typescript
 * const result = validatePasswordStrength('MyPass123');
 * if (!result.isValid) {
 *   console.log('Errors:', result.errors);
 * }
 * ```
 */
export function validatePasswordStrength(
	password: string,
	options?: PasswordStrengthOptions,
): PasswordValidationResult {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const errors: string[] = [];

	// 最小長チェック
	if (password.length < opts.minLength) {
		errors.push(`パスワードは${opts.minLength}文字以上である必要があります`);
	}

	// 大文字チェック
	if (opts.requireUppercase && !/[A-Z]/.test(password)) {
		errors.push('少なくとも1つの大文字を含める必要があります');
	}

	// 小文字チェック
	if (opts.requireLowercase && !/[a-z]/.test(password)) {
		errors.push('少なくとも1つの小文字を含める必要があります');
	}

	// 数字チェック
	if (opts.requireNumbers && !/[0-9]/.test(password)) {
		errors.push('少なくとも1つの数字を含める必要があります');
	}

	// 特殊文字チェック
	if (opts.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
		errors.push('少なくとも1つの特殊文字を含める必要があります');
	}

	// 強度の計算
	let strength: 'weak' | 'medium' | 'strong' = 'weak';
	const meetsRequirements = errors.length === 0;

	if (meetsRequirements) {
		const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
		const isLongEnough = password.length >= 12;

		if (hasSpecialChars && isLongEnough) {
			strength = 'strong';
		} else {
			strength = 'medium';
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
		strength,
	};
}

/**
 * パスワード強度をパーセンテージで返す（0-100）
 *
 * @param password 検証するパスワード
 * @returns 強度スコア（0-100）
 */
export function getPasswordStrengthScore(password: string): number {
	let score = 0;

	// 長さによるスコア（最大40点）
	if (password.length >= 8) score += 20;
	if (password.length >= 12) score += 10;
	if (password.length >= 16) score += 10;

	// 文字種によるスコア（各15点、最大60点）
	if (/[a-z]/.test(password)) score += 15;
	if (/[A-Z]/.test(password)) score += 15;
	if (/[0-9]/.test(password)) score += 15;
	if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 15;

	return Math.min(score, 100);
}

/**
 * パスワード強度を色コードで返す
 *
 * @param strength パスワード強度
 * @returns Tailwind CSSクラス名
 */
export function getPasswordStrengthColor(strength: 'weak' | 'medium' | 'strong'): string {
	switch (strength) {
		case 'weak':
			return 'text-red-600';
		case 'medium':
			return 'text-yellow-600';
		case 'strong':
			return 'text-green-600';
	}
}

/**
 * パスワード強度のラベルを返す
 *
 * @param strength パスワード強度
 * @returns 日本語ラベル
 */
export function getPasswordStrengthLabel(strength: 'weak' | 'medium' | 'strong'): string {
	switch (strength) {
		case 'weak':
			return '弱い';
		case 'medium':
			return '普通';
		case 'strong':
			return '強い';
	}
}
