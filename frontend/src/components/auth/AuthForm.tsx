import { useState } from 'react';
import { EmailAuthForm } from './EmailAuthForm';
import { PasswordResetForm } from './PasswordResetForm';
import { LoginPageLayout } from './LoginPageLayout';
import { useStartOAuthRegistration } from '../../hooks/useInvitationsQueries';
import { resolveInvitationErrorMessage } from '../../constants/invitationErrorMessages';
import { isApiError } from '../../utils/apiError';
import type { InvitationContextResponse, InvitationOAuthProvider } from '../../types/invitation';

type AuthMode = 'login' | 'signup' | 'resetPassword';

interface AuthFormProps {
	prefilledInvitationCode?: string;
	inviterContext?: InvitationContextResponse | null;
}

const PROVIDER_LABELS: Record<InvitationOAuthProvider, string> = {
	google: 'Google',
	github: 'GitHub',
	line: 'LINE',
	apple: 'Apple',
	x: 'X',
};

interface InvitationModeFormProps {
	invitationCode: string;
	setInvitationCode: (code: string) => void;
	inviterContext: InvitationContextResponse | null | undefined;
	onSwitchToEmail: () => void;
}

function InvitationModeForm({
	invitationCode,
	setInvitationCode,
	inviterContext,
	onSwitchToEmail,
}: InvitationModeFormProps) {
	const [message, setMessage] = useState('');
	const startOAuth = useStartOAuthRegistration();

	const inviterName = inviterContext?.creator.name?.trim() || null;
	const headline = inviterName
		? `${inviterName}さんから招待されました`
		: 'あるユーザーから招待されました';

	const handleOAuthStart = async (provider: InvitationOAuthProvider) => {
		setMessage('');
		if (!invitationCode) {
			setMessage('招待コードを入力してください');
			return;
		}
		try {
			const response = await startOAuth.mutateAsync({ provider, invitationCode });
			window.location.assign(response.authorizationUrl);
		} catch (error) {
			if (isApiError(error) && error.code) {
				setMessage(resolveInvitationErrorMessage(error.code));
			} else {
				const fallback = error instanceof Error ? error.message : 'OAuth start failed';
				setMessage(fallback);
			}
		}
	};

	return (
		<LoginPageLayout>
			<div className="max-w-md w-full mx-auto p-6 bg-black/75 rounded-lg border border-green-300/30 shadow-2xl backdrop-blur-sm">
				<h2 className="text-2xl font-bold mb-2 text-center text-green-100">新規登録</h2>
				<p className="mb-6 text-center text-sm text-emerald-200">{headline}</p>

				{message && (
					<div
						role="alert"
						className="mb-4 p-3 rounded-lg text-sm bg-red-900/50 text-red-300 border border-red-700"
					>
						{message}
					</div>
				)}

				<div className="mb-6">
					<label htmlFor="invitationCode" className="block text-sm font-medium text-green-200 mb-1">
						招待コード
					</label>
					<input
						type="text"
						id="invitationCode"
						value={invitationCode}
						onChange={(e) => setInvitationCode(e.target.value)}
						autoCapitalize="off"
						autoComplete="off"
						inputMode="text"
						spellCheck={false}
						required
						className="w-full px-3 py-2 bg-black/40 border border-green-700 text-green-100 placeholder-green-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
						placeholder="招待コードを入力してください"
					/>
				</div>

				<div className="space-y-3">
					{(Object.keys(PROVIDER_LABELS) as InvitationOAuthProvider[]).map((provider) => (
						<button
							key={provider}
							type="button"
							disabled={startOAuth.isPending}
							onClick={() => handleOAuthStart(provider)}
							className="w-full bg-black/40 border border-green-700 text-green-100 hover:bg-black/60 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 disabled:opacity-50"
						>
							{PROVIDER_LABELS[provider]}で登録
						</button>
					))}
				</div>

				<div className="relative my-6">
					<div className="absolute inset-0 flex items-center">
						<div className="w-full border-t border-green-800"></div>
					</div>
					<div className="relative flex justify-center text-sm">
						<span className="px-2 bg-transparent text-green-600">または</span>
					</div>
				</div>

				<button
					type="button"
					onClick={onSwitchToEmail}
					className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
				>
					メール/パスワードで登録
				</button>
			</div>
		</LoginPageLayout>
	);
}

export default function AuthForm({ prefilledInvitationCode, inviterContext }: AuthFormProps = {}) {
	const isInvitationFlow = !!prefilledInvitationCode;
	const [mode, setMode] = useState<AuthMode>(isInvitationFlow ? 'signup' : 'login');
	const [showEmailForm, setShowEmailForm] = useState(false);
	const [invitationCode, setInvitationCode] = useState(prefilledInvitationCode ?? '');

	const switchMode = (newMode: AuthMode) => {
		setMode(newMode);
		setInvitationCode(prefilledInvitationCode ?? '');
	};

	// 招待モード（/invite/:code 経由）
	if (isInvitationFlow && !showEmailForm) {
		return (
			<InvitationModeForm
				invitationCode={invitationCode}
				setInvitationCode={setInvitationCode}
				inviterContext={inviterContext}
				onSwitchToEmail={() => setShowEmailForm(true)}
			/>
		);
	}

	// 招待モード経由でメール登録に切り替え
	if (isInvitationFlow && showEmailForm) {
		return (
			<LoginPageLayout>
				<EmailAuthForm
					mode="signup"
					prefilledInvitationCode={invitationCode}
					onSwitchMode={() => setShowEmailForm(false)}
					onForgotPassword={() => setShowEmailForm(false)}
				/>
			</LoginPageLayout>
		);
	}

	// パスワードリセットフォーム
	if (mode === 'resetPassword') {
		return (
			<LoginPageLayout>
				<PasswordResetForm onBackToLogin={() => switchMode('login')} />
			</LoginPageLayout>
		);
	}

	// Email/Password認証フォーム
	return (
		<LoginPageLayout>
			<EmailAuthForm
				mode={mode}
				onSwitchMode={() => switchMode(mode === 'login' ? 'signup' : 'login')}
				onForgotPassword={() => switchMode('resetPassword')}
			/>
		</LoginPageLayout>
	);
}
