import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PasswordInput } from '../ui/PasswordInput';
import { OAuthLoginButton } from '../ui/OAuthLoginButton';
import { isApiError } from '../../utils/apiError';
import { resolveInvitationErrorMessage } from '../../constants/invitationErrorMessages';

interface EmailAuthFormProps {
	mode: 'login' | 'signup';
	onSwitchMode: () => void;
	onForgotPassword: () => void;
	prefilledInvitationCode?: string;
}

export function EmailAuthForm({
	mode,
	onSwitchMode,
	onForgotPassword,
	prefilledInvitationCode,
}: EmailAuthFormProps) {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [invitationCode, setInvitationCode] = useState(prefilledInvitationCode ?? '');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');
	const { login, register } = useAuth();

	const resetFormFields = (clearMessage = true) => {
		if (clearMessage) setMessage('');
		setEmail('');
		setPassword('');
		setName('');
		setInvitationCode(prefilledInvitationCode ?? '');
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setMessage('');

		try {
			if (mode === 'signup') {
				await register(email, password, name || undefined, invitationCode);
				resetFormFields(false);
			} else {
				await login(email, password);
			}
		} catch (error: unknown) {
			if (isApiError(error) && error.code && error.code.startsWith('INV')) {
				setMessage(resolveInvitationErrorMessage(error.code));
			} else {
				const errorMessage = error instanceof Error ? error.message : 'An error occurred';
				setMessage(errorMessage);
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-md mx-auto mt-8 p-6 bg-black/75 rounded-lg border border-green-300/30 shadow-2xl backdrop-blur-sm">
			<h2 className="text-2xl font-bold mb-6 text-center text-green-100">
				{mode === 'signup' ? '新規登録' : 'ログイン'}
			</h2>

			{message && (
				<div className="mb-4 p-3 rounded-lg text-sm bg-red-900/50 text-red-300 border border-red-700">
					{message}
				</div>
			)}

			<form onSubmit={handleSubmit} className="space-y-4 mb-6">
				<div>
					<label htmlFor="email" className="block text-sm font-medium text-green-200 mb-1">
						メールアドレス
					</label>
					<input
						type="email"
						id="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						className="w-full px-3 py-2 bg-black/40 border border-green-700 text-green-100 placeholder-green-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
					/>
				</div>
				<PasswordInput
					id="password"
					label="パスワード"
					value={password}
					onChange={setPassword}
					required
					showStrengthIndicator={mode === 'signup'}
					autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
				/>
				{mode === 'signup' && (
					<>
						<div>
							<label htmlFor="name" className="block text-sm font-medium text-green-200 mb-1">
								名前（任意）
							</label>
							<input
								type="text"
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="w-full px-3 py-2 bg-black/40 border border-green-700 text-green-100 placeholder-green-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
							/>
						</div>
						<div>
							<label
								htmlFor="invitationCode"
								className="block text-sm font-medium text-green-200 mb-1"
							>
								招待コード（必須）
							</label>
							<input
								type="text"
								id="invitationCode"
								value={invitationCode}
								onChange={(e) => setInvitationCode(e.target.value)}
								required
								autoCapitalize="off"
								autoComplete="off"
								inputMode="text"
								spellCheck={false}
								className="w-full px-3 py-2 bg-black/40 border border-green-700 text-green-100 placeholder-green-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
								placeholder="招待コードを入力してください"
							/>
						</div>
					</>
				)}
				<button
					type="submit"
					disabled={loading}
					className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
				>
					{loading ? '処理中...' : mode === 'signup' ? '新規登録' : 'ログイン'}
				</button>
				{mode === 'login' && (
					<div className="text-center mt-3">
						<button
							type="button"
							onClick={onForgotPassword}
							className="text-emerald-400 hover:text-emerald-300 text-sm underline"
						>
							パスワードを忘れた方はこちら
						</button>
					</div>
				)}
			</form>

			<div className="relative mb-6">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-t border-green-800"></div>
				</div>
				<div className="relative flex justify-center text-sm">
					<span className="px-2 bg-transparent text-green-600">または</span>
				</div>
			</div>

			<div className="space-y-3">
				<OAuthLoginButton provider="google" mode={mode} variant="forest" />
				<OAuthLoginButton provider="apple" mode={mode} variant="forest" />
				<OAuthLoginButton provider="x" mode={mode} variant="forest" />
			</div>

			<div className="text-center mt-4">
				<button onClick={onSwitchMode} className="text-emerald-400 hover:text-emerald-300 text-sm">
					{mode === 'signup'
						? 'すでにアカウントをお持ちの方はこちら'
						: 'アカウントをお持ちでない方はこちら'}
				</button>
			</div>
		</div>
	);
}
