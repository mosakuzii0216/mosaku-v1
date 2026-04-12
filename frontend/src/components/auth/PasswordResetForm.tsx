import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';

interface PasswordResetFormProps {
	onBackToLogin: () => void;
}

export function PasswordResetForm({ onBackToLogin }: PasswordResetFormProps) {
	const [email, setEmail] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');
	const { resetPassword } = useAuth();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

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
			logger.error('パスワードリセットエラー:', error);
			setMessage(error instanceof Error ? error.message : 'Failed to send password reset email');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-md mx-auto mt-8 p-6 bg-black/75 rounded-lg border border-green-300/30 shadow-2xl backdrop-blur-sm">
			<h2 className="text-2xl font-bold mb-6 text-center text-green-100">パスワードリセット</h2>

			{message && (
				<div
					className={`mb-4 p-3 rounded-lg text-sm ${
						message.includes('送信しました')
							? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
							: 'bg-red-900/50 text-red-300 border border-red-700'
					}`}
				>
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
						placeholder="登録時のメールアドレスを入力"
					/>
				</div>
				<button
					type="submit"
					disabled={loading}
					className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
				>
					{loading ? '送信中...' : 'パスワードリセットメールを送信'}
				</button>
			</form>

			<div className="text-center">
				<button
					type="button"
					onClick={onBackToLogin}
					className="text-emerald-400 hover:text-emerald-300 text-sm"
				>
					ログインページに戻る
				</button>
			</div>
		</div>
	);
}
