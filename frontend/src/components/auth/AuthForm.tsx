import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { GoogleLoginButton } from '../ui/GoogleLoginButton';
import { GitHubLoginButton } from '../ui/GitHubLoginButton';
import { XLoginButton } from '../ui/XLoginButton';
import { OAuthInviteForm } from './OAuthInviteForm';

type AuthMode = 'login' | 'signup' | 'resetPassword' | 'googleInvite' | 'githubInvite' | 'xInvite';

export default function AuthForm() {
	const [searchParams] = useSearchParams();
	const [loading, setLoading] = useState(false);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [invitationCode, setInvitationCode] = useState('');
	const [message, setMessage] = useState('');
	const [mode, setMode] = useState<AuthMode>('login');

	const [pendingOAuthUser, setPendingOAuthUser] = useState<any>(null);

	const {
		login,
		register,
		resetPassword,
		googleRegisterWithInvitation,
		githubRegisterWithInvitation,
		xRegisterWithInvitation,
	} = useAuth();

	const resetFormFields = useCallback((clearMessage = true) => {
		if (clearMessage) setMessage('');
		setEmail('');
		setPassword('');
		setName('');
		setInvitationCode('');
	}, []);

	useEffect(() => {
		const error = searchParams.get('error');
		if (error === 'invitation_required') {
			const providers = [
				{ key: 'pendingGoogleUser', mode: 'googleInvite', setter: setPendingOAuthUser },
				{ key: 'pendingGitHubUser', mode: 'githubInvite', setter: setPendingOAuthUser },
				{ key: 'pendingXUser', mode: 'xInvite', setter: setPendingOAuthUser },
			] as const;

			let userFound = false;
			for (const provider of providers) {
				const storedUser = sessionStorage.getItem(provider.key);
				if (storedUser) {
					try {
						const user = JSON.parse(storedUser);
						provider.setter(user);
						setMessage(`ユーザー登録には招待コードが必要です。`);
						setMode(provider.mode);
						userFound = true;
						break;
					} catch (err) {
						console.error(`Failed to parse pending user for ${provider.key}:`, err);
						setMessage('認証処理でエラーが発生しました。再度お試しください。');
					}
				}
			}

			if (!userFound) {
				setMessage('新規ユーザーの場合は招待コードが必要です。新規登録を選択してください。');
				setMode('signup');
			}
		} else if (error === 'invite_required') {
			setMessage('新規ユーザーの場合は招待コードが必要です。新規登録を選択してください。');
			setMode('signup');
		}
	}, [searchParams]);

	const handleEmailAuth = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setMessage('');

		try {
			if (mode === 'signup') {
				await register(email, password, name || undefined, invitationCode);
				setMessage('Registration successful! You can now login with your credentials.');
				setMode('login');
				resetFormFields(false);
			} else if (mode === 'login') {
				await login(email, password);
			}
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'An error occurred';
			setMessage(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const handleForgotPassword = async () => {
		if (!email) {
			setMessage('メールアドレスを入力してください');
			return;
		}

		setLoading(true);
		setMessage('');

		try {
			await resetPassword(email);
			setMessage('パスワードリセットメールを送信しました。メールをご確認ください。');
		} catch (error: unknown) {
			console.error('パスワードリセットエラー:', error);
			setMessage(error instanceof Error ? error.message : 'Failed to send password reset email');
		} finally {
			setLoading(false);
		}
	};

	const handleOAuthRegistration = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!pendingOAuthUser || !invitationCode) {
			setMessage('招待コードを入力してください');
			return;
		}

		setLoading(true);
		setMessage('');

		try {
			let registerFunction;
			if (mode === 'googleInvite') registerFunction = googleRegisterWithInvitation;
			else if (mode === 'githubInvite') registerFunction = githubRegisterWithInvitation;
			else if (mode === 'xInvite') registerFunction = xRegisterWithInvitation;
			else return;

			await registerFunction(pendingOAuthUser, invitationCode);
		} catch (error: unknown) {
			console.error(`${mode}登録エラー:`, error);
			const errorMessage = error instanceof Error ? error.message : `${mode} registration failed`;
			setMessage(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const switchMode = (newMode: AuthMode) => {
		setMode(newMode);
		resetFormFields();
		if (pendingOAuthUser) {
			const providerKey =
				mode === 'googleInvite'
					? 'pendingGoogleUser'
					: mode === 'githubInvite'
						? 'pendingGitHubUser'
						: mode === 'xInvite'
							? 'pendingXUser'
							: null;
			if (providerKey) sessionStorage.removeItem(providerKey);
			setPendingOAuthUser(null);
		}
	};

	const getTitle = () => {
		switch (mode) {
			case 'signup':
				return '新規登録';
			case 'resetPassword':
				return 'パスワードリセット';
			case 'googleInvite':
				return 'Google アカウント登録';
			case 'githubInvite':
				return 'GitHub アカウント登録';
			case 'xInvite':
				return 'X アカウント登録';
			default:
				return 'ログイン';
		}
	};

	return (
		<div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
			<h2 className="text-2xl font-bold mb-6 text-center">{getTitle()}</h2>

			{message && (
				<div
					className={`mb-4 p-3 rounded-lg text-sm ${
						message.includes('successful') || message.includes('送信しました')
							? 'bg-green-100 text-green-700'
							: 'bg-red-100 text-red-700'
					}`}
				>
					{message}
				</div>
			)}

			{mode === 'googleInvite' || mode === 'githubInvite' || mode === 'xInvite' ? (
				<OAuthInviteForm
					providerName={
						mode === 'googleInvite' ? 'Google' : mode === 'githubInvite' ? 'GitHub' : 'X'
					}
					pendingUser={pendingOAuthUser}
					invitationCode={invitationCode}
					setInvitationCode={setInvitationCode}
					onSubmit={handleOAuthRegistration}
					loading={loading}
				/>
			) : mode === 'resetPassword' ? (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleForgotPassword();
					}}
					className="space-y-4 mb-6"
				>
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
							placeholder="登録時のメールアドレスを入力"
						/>
					</div>
					<button
						type="submit"
						disabled={loading}
						className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
					>
						{loading ? '送信中...' : 'パスワードリセットメールを送信'}
					</button>
				</form>
			) : (
				<form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
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
					<div>
						<label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
							パスワード
						</label>
						<input
							type="password"
							id="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={6}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
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
								onClick={() => switchMode('resetPassword')}
								className="text-blue-500 hover:text-blue-600 text-sm underline"
							>
								パスワードを忘れた方はこちら
							</button>
						</div>
					)}
				</form>
			)}

			{mode !== 'resetPassword' && !mode.endsWith('Invite') && (
				<>
					<div className="relative mb-6">
						<div className="absolute inset-0 flex items-center">
							<div className="w-full border-t border-gray-300"></div>
						</div>
						<div className="relative flex justify-center text-sm">
							<span className="px-2 bg-white text-gray-500">または</span>
						</div>
					</div>
					<div className="space-y-3">
						<GoogleLoginButton mode={mode === 'signup' ? 'signup' : 'login'} />
						<GitHubLoginButton mode={mode === 'signup' ? 'signup' : 'login'} />
						<XLoginButton mode={mode === 'signup' ? 'signup' : 'login'} />
					</div>
				</>
			)}

			<div className="text-center mb-4">
				{mode.endsWith('Invite') ? (
					<div className="space-y-2">
						<button
							onClick={() => switchMode('login')}
							className="text-blue-500 hover:text-blue-600 text-sm block w-full"
						>
							ログインページに戻る
						</button>
						<button
							onClick={() => switchMode('signup')}
							className="text-gray-500 hover:text-gray-600 text-sm block w-full"
						>
							メール/パスワードで新規登録
						</button>
					</div>
				) : mode === 'resetPassword' ? (
					<button
						onClick={() => switchMode('login')}
						className="text-blue-500 hover:text-blue-600 text-sm"
					>
						ログインページに戻る
					</button>
				) : (
					<button
						onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
						className="text-blue-500 hover:text-blue-600 text-sm"
					>
						{mode === 'signup'
							? 'すでにアカウントをお持ちの方はこちら'
							: 'アカウントをお持ちでない方はこちら'}
					</button>
				)}
			</div>
		</div>
	);
}
