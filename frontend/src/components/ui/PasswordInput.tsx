import { useState, useEffect } from 'react';
import {
	validatePasswordStrength,
	getPasswordStrengthColor,
	getPasswordStrengthLabel,
	getPasswordStrengthScore,
} from '../../utils/passwordValidator';

interface PasswordInputProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	required?: boolean;
	showStrengthIndicator?: boolean;
	placeholder?: string;
	autoComplete?: string;
}

/**
 * パスワード入力コンポーネント
 * パスワード強度の視覚的フィードバックを提供
 */
export function PasswordInput({
	id,
	label,
	value,
	onChange,
	required = false,
	showStrengthIndicator = false,
	placeholder,
	autoComplete,
}: PasswordInputProps) {
	const [showPassword, setShowPassword] = useState(false);
	const [validationResult, setValidationResult] = useState(validatePasswordStrength(''));

	useEffect(() => {
		if (showStrengthIndicator && value) {
			setValidationResult(validatePasswordStrength(value));
		}
	}, [value, showStrengthIndicator]);

	const strengthScore = getPasswordStrengthScore(value);

	return (
		<div>
			<label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
				{label}
			</label>
			<div className="relative">
				<input
					type={showPassword ? 'text' : 'password'}
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					required={required}
					placeholder={placeholder}
					autoComplete={autoComplete}
					className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
				/>
				<button
					type="button"
					onClick={() => setShowPassword(!showPassword)}
					className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
					tabIndex={-1}
				>
					{showPassword ? (
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
							/>
						</svg>
					) : (
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
							/>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
							/>
						</svg>
					)}
				</button>
			</div>

			{showStrengthIndicator && value && (
				<div className="mt-2 space-y-2">
					{/* 強度バー */}
					<div className="flex items-center gap-2">
						<div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
							<div
								className={`h-full transition-all duration-300 ${
									validationResult.strength === 'weak'
										? 'bg-red-500'
										: validationResult.strength === 'medium'
											? 'bg-yellow-500'
											: 'bg-green-500'
								}`}
								style={{ width: `${strengthScore}%` }}
							/>
						</div>
						<span
							className={`text-sm font-medium ${getPasswordStrengthColor(validationResult.strength)}`}
						>
							{getPasswordStrengthLabel(validationResult.strength)}
						</span>
					</div>

					{/* エラーメッセージ */}
					{validationResult.errors.length > 0 && (
						<ul className="text-xs text-red-600 space-y-1">
							{validationResult.errors.map((error, index) => (
								<li key={index}>• {error}</li>
							))}
						</ul>
					)}

					{/* 要件リスト */}
					{validationResult.errors.length === 0 && (
						<div className="text-xs text-green-600">✓ パスワード要件を満たしています</div>
					)}
				</div>
			)}
		</div>
	);
}
