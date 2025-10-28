import React from 'react';

interface PendingUser {
	email?: string;
	username?: string;
}

interface OAuthInviteFormProps {
	providerName: 'Google' | 'GitHub' | 'X';
	pendingUser: PendingUser | null;
	invitationCode: string;
	setInvitationCode: (code: string) => void;
	onSubmit: (e: React.FormEvent) => void;
	loading: boolean;
}

const providerStyles = {
	Google: {
		bgColor: 'bg-blue-50',
		textColor: 'text-blue-700',
		textSubColor: 'text-blue-600',
		buttonColor: 'bg-blue-500',
		buttonHoverColor: 'hover:bg-blue-600',
	},
	GitHub: {
		bgColor: 'bg-gray-50',
		textColor: 'text-gray-700',
		textSubColor: 'text-gray-600',
		buttonColor: 'bg-gray-900',
		buttonHoverColor: 'hover:bg-gray-800',
	},
	X: {
		bgColor: 'bg-black',
		textColor: 'text-white',
		textSubColor: 'text-gray-300',
		buttonColor: 'bg-black',
		buttonHoverColor: 'hover:bg-gray-900',
	},
};

export const OAuthInviteForm: React.FC<OAuthInviteFormProps> = ({
	providerName,
	pendingUser,
	invitationCode,
	setInvitationCode,
	onSubmit,
	loading,
}) => {
	const styles = providerStyles[providerName];

	return (
		<form onSubmit={onSubmit} className="space-y-4 mb-6">
			{pendingUser && (
				<div className={`${styles.bgColor} p-3 rounded-lg mb-4`}>
					<p className={`text-sm ${styles.textColor}`}>
						<strong>{providerName} アカウント:</strong> {pendingUser.email || pendingUser.username}
					</p>
					<p className={`text-xs ${styles.textSubColor} mt-1`}>
						このアカウントで登録するには招待コードが必要です
					</p>
				</div>
			)}

			<div>
				<label htmlFor="invitationCode" className="block text-sm font-medium text-gray-700 mb-1">
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

			<button
				type="submit"
				disabled={loading}
				className={`w-full ${styles.buttonColor} ${styles.buttonHoverColor} text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50`}
			>
				{loading ? '登録中...' : `${providerName}で登録`}
			</button>
		</form>
	);
};
