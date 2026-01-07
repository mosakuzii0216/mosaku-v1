import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PasswordInput } from '../ui/PasswordInput';
import { GoogleLoginButton } from '../ui/GoogleLoginButton';
import { GitHubLoginButton } from '../ui/GitHubLoginButton';
import { XLoginButton } from '../ui/XLoginButton';

interface EmailAuthFormProps {
	mode: 'login' | 'signup';
	onSwitchMode: () => void;
	onForgotPassword: () => void;
}

export function EmailAuthForm({ mode, onSwitchMode, onForgotPassword }: EmailAuthFormProps) {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [invitationCode, setInvitationCode] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');
	const { login, register } = useAuth();

	const resetFormFields = (clearMessage = true) => {
		if (clearMessage) setMessage('');
		setEmail('');
		setPassword('');
		setName('');
		setInvitationCode('');
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setMessage('');

		try {
			if (mode === 'signup') {
				await register(email, password, name || undefined, invitationCode);
				setMessage('Registration successful! You can now login with your credentials.');
				resetFormFields(false);
			} else {
				await login(email, password);
			}
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'An error occurred';
			setMessage(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
			<h2 className="text-2xl font-bold mb-6 text-center">
				{mode === 'signup' ? '新規登録' : 'ログイン'}
			</h2>

			{message && (
				<div
					className={`mb-4 p-3 rounded-lg text-sm ${
						message.includes('successful')
							? 'bg-green-100 text-green-700'
							: 'bg-red-100 text-red-700'
					}`}
				>
					{message}
				</div>
			)}

			<form onSubmit={handleSubmit} className="space-y-4 mb-6">
				<div>
					<label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
						メールアドレス
					</label>
					<input
						type="email"
						id="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
							<label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
								名前（任意）
							</label>
							<input
								type="text"
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label
								htmlFor="invitationCode"
								className="block text-sm font-medium text-gray-700 mb-1"
							>
								招待コード（必須）
							</label>
							<input
								type="text"
								id="invitationCode"
								value={invitationCode}
								onChange={(e) => setInvitationCode(e.target.value)}
								required
								className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
								placeholder="招待コードを入力してください"
							/>
						</div>
					</>
				)}
				<button
					type="submit"
					disabled={loading}
					className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
				>
					{loading ? '処理中...' : mode === 'signup' ? '新規登録' : 'ログイン'}
				</button>
				{mode === 'login' && (
					<div className="text-center mt-3">
						<button
							type="button"
							onClick={onForgotPassword}
							className="text-blue-500 hover:text-blue-600 text-sm underline"
						>
							パスワードを忘れた方はこちら
						</button>
					</div>
				)}
			</form>

			<div className="relative mb-6">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-t border-gray-300"></div>
				</div>
				<div className="relative flex justify-center text-sm">
					<span className="px-2 bg-white text-gray-500">または</span>
				</div>
			</div>

			<div className="space-y-3">
				<GoogleLoginButton mode={mode} />
				<GitHubLoginButton mode={mode} />
				<XLoginButton mode={mode} />
			</div>

			<div className="text-center mt-4">
				<button onClick={onSwitchMode} className="text-blue-500 hover:text-blue-600 text-sm">
					{mode === 'signup'
						? 'すでにアカウントをお持ちの方はこちら'
						: 'アカウントをお持ちでない方はこちら'}
				</button>
			</div>
		</div>
	);
}
