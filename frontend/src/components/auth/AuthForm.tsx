import { useState } from 'react';
import { EmailAuthForm } from './EmailAuthForm';
import { PasswordResetForm } from './PasswordResetForm';
import { LoginPageLayout } from './LoginPageLayout';
import { PerkBadge } from './PerkBadge';
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

// 主要手段（常に表示）
const PRIMARY_PROVIDERS: InvitationOAuthProvider[] = ['google'];
// 展開操作で表示
const SECONDARY_PROVIDERS: InvitationOAuthProvider[] = ['github', 'line', 'apple', 'x'];

interface InvitationModeFormProps {
	invitationCode: string;
	inviterContext: InvitationContextResponse | null | undefined;
	onSwitchToEmail: () => void;
	onSwitchToLogin: () => void;
}

function InvitationModeForm({
	invitationCode,
	inviterContext,
	onSwitchToEmail,
	onSwitchToLogin,
}: InvitationModeFormProps) {
	const [message, setMessage] = useState('');
	const [showMoreProviders, setShowMoreProviders] = useState(false);
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
				<p className="mb-3 text-center text-sm text-emerald-200">{headline}</p>

				{inviterContext?.perk && (
					<div className="flex justify-center mb-4">
						<PerkBadge perk={inviterContext.perk} />
					</div>
				)}

				{/* 招待コード適用済み表示（読み取り専用） */}
				<div className="mb-6 px-3 py-2 bg-black/40 border border-green-700/50 rounded-lg flex items-center justify-between">
					<div className="flex flex-col">
						<span className="text-xs text-green-600 mb-0.5">招待コード</span>
						<span className="text-green-100 font-mono text-sm">{invitationCode}</span>
					</div>
					<span className="text-xs text-emerald-400">✓ 適用済み</span>
				</div>

				{message && (
					<div
						role="alert"
						className="mb-4 p-3 rounded-lg text-sm bg-red-900/50 text-red-300 border border-red-700"
					>
						{message}
					</div>
				)}

				{/* 主要認証手段 */}
				<div className="space-y-3">
					{PRIMARY_PROVIDERS.map((provider) => (
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

				<div className="relative my-4">
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
					className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 rounded-lg font-medium transition-colors mb-3"
				>
					メール/パスワードで登録
				</button>

				{/* 他の手段（展開式） */}
				{!showMoreProviders ? (
					<button
						type="button"
						onClick={() => setShowMoreProviders(true)}
						className="w-full text-green-600 hover:text-green-400 text-sm py-1 transition-colors"
					>
						他の方法で登録
					</button>
				) : (
					<div className="space-y-3">
						{SECONDARY_PROVIDERS.map((provider) => (
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
				)}

				{/* ログイン導線 */}
				<p className="mt-4 text-center text-sm text-green-600">
					既にアカウントをお持ちですか？{' '}
					<button
						type="button"
						onClick={onSwitchToLogin}
						className="text-emerald-400 hover:text-emerald-300 underline transition-colors"
					>
						ログイン
					</button>
				</p>
			</div>
		</LoginPageLayout>
	);
}

export default function AuthForm({ prefilledInvitationCode, inviterContext }: AuthFormProps = {}) {
	const isInvitationFlow = !!prefilledInvitationCode;
	const [mode, setMode] = useState<AuthMode>(isInvitationFlow ? 'signup' : 'login');
	const [showEmailForm, setShowEmailForm] = useState(false);
	const [invitationCode] = useState(prefilledInvitationCode ?? '');

	const switchMode = (newMode: AuthMode) => {
		setMode(newMode);
	};

	// 招待モード（/invite/:code 経由）
	if (isInvitationFlow && !showEmailForm && mode !== 'login') {
		return (
			<InvitationModeForm
				invitationCode={invitationCode}
				inviterContext={inviterContext}
				onSwitchToEmail={() => setShowEmailForm(true)}
				onSwitchToLogin={() => switchMode('login')}
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

	// 招待モード経由でログインに切り替え
	if (isInvitationFlow && mode === 'login') {
		return (
			<LoginPageLayout>
				<EmailAuthForm
					mode="login"
					onSwitchMode={() => switchMode('signup')}
					onForgotPassword={() => switchMode('resetPassword')}
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
