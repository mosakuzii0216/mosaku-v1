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
		<div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
			<h2 className="text-2xl font-bold mb-6 text-center">パスワードリセット</h2>

			{message && (
				<div
					className={`mb-4 p-3 rounded-lg text-sm ${
						message.includes('送信しました')
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

			<div className="text-center">
				<button onClick={onBackToLogin} className="text-blue-500 hover:text-blue-600 text-sm">
					ログインページに戻る
				</button>
			</div>
		</div>
	);
}
