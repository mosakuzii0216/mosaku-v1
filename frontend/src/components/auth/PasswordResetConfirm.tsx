import { useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import { AuthAPI } from '../../utils/auth';
import { validatePasswordStrength } from '../../utils/passwordValidator';
import { logger } from '../../utils/logger';

export default function PasswordResetConfirm() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token');

	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');
	const [success, setSuccess] = useState(false);

	if (!token) {
		return (
			<div className="max-w-md mx-auto mt-8 p-6 bg-black/75 rounded-lg border border-green-300/30 shadow-2xl backdrop-blur-sm">
				<h2 className="text-2xl font-bold mb-4 text-center text-green-100">パスワード再設定</h2>
				<div className="mb-4 p-3 rounded-lg text-sm bg-red-900/50 text-red-300 border border-red-700">
					無効なリセットリンクです。メール内のリンクを再度ご確認ください。
				</div>
				<div className="text-center">
					<Link to="/auth/login" className="text-emerald-400 hover:text-emerald-300 text-sm">
						ログインページへ戻る
					</Link>
				</div>
			</div>
		);
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (newPassword !== confirmPassword) {
			setMessage('パスワードが一致しません');
			return;
		}

		const validation = validatePasswordStrength(newPassword);
		if (!validation.isValid) {
			setMessage(`パスワードが要件を満たしていません: ${validation.errors.join(', ')}`);
			return;
		}

		setLoading(true);
		setMessage('');

		try {
			const result = await AuthAPI.confirmPasswordReset(token, newPassword);
			setMessage(result.message);
			setSuccess(true);
		} catch (error: unknown) {
			logger.error('パスワード再設定エラー:', error);
			setMessage(error instanceof Error ? error.message : 'パスワードの再設定に失敗しました');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-md mx-auto mt-8 p-6 bg-black/75 rounded-lg border border-green-300/30 shadow-2xl backdrop-blur-sm">
			<h2 className="text-2xl font-bold mb-6 text-center text-green-100">パスワード再設定</h2>

			{message && (
				<div
					className={`mb-4 p-3 rounded-lg text-sm ${
						success
							? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
							: 'bg-red-900/50 text-red-300 border border-red-700'
					}`}
				>
					{message}
				</div>
			)}

			{success ? (
				<div className="text-center">
					<Link to="/auth/login" className="text-emerald-400 hover:text-emerald-300 text-sm">
						ログインページへ進む
					</Link>
				</div>
			) : (
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label htmlFor="newPassword" className="block text-sm font-medium text-green-200 mb-1">
							新しいパスワード
						</label>
						<input
							type="password"
							id="newPassword"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							required
							autoComplete="new-password"
							className="w-full px-3 py-2 bg-black/40 border border-green-700 text-green-100 placeholder-green-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
							placeholder="8文字以上、大文字・小文字・数字を含む"
						/>
					</div>

					<div>
						<label
							htmlFor="confirmPassword"
							className="block text-sm font-medium text-green-200 mb-1"
						>
							パスワード確認
						</label>
						<input
							type="password"
							id="confirmPassword"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							required
							autoComplete="new-password"
							className="w-full px-3 py-2 bg-black/40 border border-green-700 text-green-100 placeholder-green-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
							placeholder="もう一度入力してください"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
					>
						{loading ? '処理中...' : 'パスワードを再設定する'}
					</button>
				</form>
			)}
		</div>
	);
}
