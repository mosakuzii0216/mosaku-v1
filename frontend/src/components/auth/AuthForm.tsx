import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { EmailAuthForm } from './EmailAuthForm';
import { PasswordResetForm } from './PasswordResetForm';
import { OAuthInviteForm } from './OAuthInviteForm';
import type { OAuthUserData } from '../../utils/auth';
import { logger } from '../../utils/logger';

type AuthMode = 'login' | 'signup' | 'resetPassword' | 'googleInvite' | 'githubInvite' | 'xInvite';

export default function AuthForm() {
	const [searchParams] = useSearchParams();
	const [mode, setMode] = useState<AuthMode>('login');
	const [pendingOAuthUser, setPendingOAuthUser] = useState<OAuthUserData | null>(null);
	const [invitationCode, setInvitationCode] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');

	const { googleRegisterWithInvitation, githubRegisterWithInvitation, xRegisterWithInvitation } =
		useAuth();

	// OAuthコールバックエラーの処理
	useEffect(() => {
		const error = searchParams.get('error');
		if (error === 'invitation_required' || error === 'invite_required') {
			const providers = [
				{ key: 'pendingGoogleUser', mode: 'googleInvite' as const },
				{ key: 'pendingGitHubUser', mode: 'githubInvite' as const },
				{ key: 'pendingXUser', mode: 'xInvite' as const },
			];

			let userFound = false;
			for (const provider of providers) {
				const storedUser = sessionStorage.getItem(provider.key);
				if (storedUser) {
					try {
						const user = JSON.parse(storedUser) as OAuthUserData;
						setPendingOAuthUser(user);
						setMessage('ユーザー登録には招待コードが必要です。');
						setMode(provider.mode);
						userFound = true;
						break;
					} catch (err) {
						logger.error(`Failed to parse pending user for ${provider.key}:`, err);
						setMessage('認証処理でエラーが発生しました。再度お試しください。');
					}
				}
			}

			if (!userFound) {
				setMessage('新規ユーザーの場合は招待コードが必要です。新規登録を選択してください。');
				setMode('signup');
			}
		}
	}, [searchParams]);

	const handleOAuthRegistration = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!pendingOAuthUser || !invitationCode) {
			setMessage('招待コードを入力してください');
			return;
		}

		setLoading(true);
		setMessage('');

		try {
			const registerFunction = {
				googleInvite: googleRegisterWithInvitation,
				githubInvite: githubRegisterWithInvitation,
				xInvite: xRegisterWithInvitation,
			}[mode as 'googleInvite' | 'githubInvite' | 'xInvite'];

			if (!registerFunction) return;

			await registerFunction(pendingOAuthUser, invitationCode);
		} catch (error: unknown) {
			logger.error(`${mode}登録エラー:`, error);
			const errorMessage = error instanceof Error ? error.message : `${mode} registration failed`;
			setMessage(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const clearPendingOAuthUser = () => {
		if (pendingOAuthUser) {
			const providerKey = {
				googleInvite: 'pendingGoogleUser',
				githubInvite: 'pendingGitHubUser',
				xInvite: 'pendingXUser',
			}[mode as 'googleInvite' | 'githubInvite' | 'xInvite'];

			if (providerKey) {
				sessionStorage.removeItem(providerKey);
			}
			setPendingOAuthUser(null);
		}
	};

	const switchMode = (newMode: AuthMode) => {
		setMode(newMode);
		setMessage('');
		setInvitationCode('');
		clearPendingOAuthUser();
	};

	const getProviderName = (): 'Google' | 'GitHub' | 'X' => {
		switch (mode) {
			case 'googleInvite':
				return 'Google';
			case 'githubInvite':
				return 'GitHub';
			case 'xInvite':
				return 'X';
			default:
				return 'Google'; // フォールバック（実際にはここに到達しないはず）
		}
	};

	// OAuth招待コードフォーム
	if (mode === 'googleInvite' || mode === 'githubInvite' || mode === 'xInvite') {
		return (
			<div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
				<h2 className="text-2xl font-bold mb-6 text-center">{getProviderName()} アカウント登録</h2>

				{message && (
					<div className="mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700">{message}</div>
				)}

				<OAuthInviteForm
					providerName={getProviderName()}
					pendingUser={pendingOAuthUser}
					invitationCode={invitationCode}
					setInvitationCode={setInvitationCode}
					onSubmit={handleOAuthRegistration}
					loading={loading}
				/>

				<div className="text-center mt-4 space-y-2">
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
			</div>
		);
	}

	// パスワードリセットフォーム
	if (mode === 'resetPassword') {
		return <PasswordResetForm onBackToLogin={() => switchMode('login')} />;
	}

	// Email/Password認証フォーム
	return (
		<EmailAuthForm
			mode={mode}
			onSwitchMode={() => switchMode(mode === 'login' ? 'signup' : 'login')}
			onForgotPassword={() => switchMode('resetPassword')}
		/>
	);
}
