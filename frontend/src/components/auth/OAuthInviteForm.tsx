import React from 'react';
import type { OAuthUserData } from '../../utils/auth';

interface OAuthInviteFormProps {
	providerName: 'Google' | 'GitHub' | 'LINE' | 'Apple' | 'X';
	pendingUser: OAuthUserData | null;
	invitationCode: string;
	setInvitationCode: (code: string) => void;
	onSubmit: (e: React.FormEvent) => void;
	loading: boolean;
}

const providerStyles = {
	Google: {
		bgColor: 'bg-black/40',
		textColor: 'text-green-100',
		textSubColor: 'text-green-300',
		buttonColor: 'bg-black/40',
		buttonHoverColor: 'hover:bg-black/60',
	},
	GitHub: {
		bgColor: 'bg-black/40',
		textColor: 'text-green-100',
		textSubColor: 'text-green-300',
		buttonColor: 'bg-black/40',
		buttonHoverColor: 'hover:bg-black/60',
	},
	LINE: {
		bgColor: 'bg-black/40',
		textColor: 'text-green-100',
		textSubColor: 'text-green-300',
		buttonColor: 'bg-black/40',
		buttonHoverColor: 'hover:bg-black/60',
	},
	Apple: {
		bgColor: 'bg-black/40',
		textColor: 'text-green-100',
		textSubColor: 'text-green-300',
		buttonColor: 'bg-black/40',
		buttonHoverColor: 'hover:bg-black/60',
	},
	X: {
		bgColor: 'bg-black/40',
		textColor: 'text-green-100',
		textSubColor: 'text-green-300',
		buttonColor: 'bg-black/40',
		buttonHoverColor: 'hover:bg-black/60',
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
						<strong>{providerName} アカウント:</strong> {pendingUser.email || pendingUser.name}
					</p>
					<p className={`text-xs ${styles.textSubColor} mt-1`}>
						このアカウントで登録するには招待コードが必要です
					</p>
				</div>
			)}

			<div>
				<label htmlFor="invitationCode" className="block text-sm font-medium text-green-200 mb-1">
					招待コード（必須）
				</label>
				<input
					type="text"
					id="invitationCode"
					value={invitationCode}
					onChange={(e) => setInvitationCode(e.target.value)}
					required
					className="w-full px-3 py-2 bg-black/40 border border-green-700 text-green-100 placeholder-green-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
					placeholder="招待コードを入力してください"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				className={`w-full ${styles.buttonColor} ${styles.buttonHoverColor} border border-green-700 text-green-100 py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50`}
			>
				{loading ? '登録中...' : `${providerName}で登録`}
			</button>
		</form>
	);
};
