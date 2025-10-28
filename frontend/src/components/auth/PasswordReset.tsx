import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function PasswordReset() {
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');
	const navigate = useNavigate();
	const { changePassword } = useAuth();

	const handlePasswordChange = async (e: React.FormEvent) => {
		e.preventDefault();

		if (newPassword !== confirmPassword) {
			setMessage('新しいパスワードが一致しません');
			return;
		}

		if (newPassword.length < 6) {
			setMessage('パスワードは6文字以上で入力してください');
			return;
		}

		setLoading(true);
		setMessage('');

		try {
			await changePassword(currentPassword, newPassword);
			setMessage('パスワードが正常に更新されました。');

			// 3秒後にトップページにリダイレクト
			setTimeout(() => {
				navigate('/');
			}, 3000);
		} catch (error: unknown) {
			console.error('パスワード変更エラー:', error);
			setMessage(error instanceof Error ? error.message : 'パスワードの更新に失敗しました');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
			<h2 className="text-2xl font-bold mb-6 text-center">パスワード変更</h2>

			{message && (
				<div
					className={`mb-4 p-3 rounded-lg text-sm ${
						message.includes('正常に更新')
							? 'bg-green-100 text-green-700'
							: 'bg-red-100 text-red-700'
					}`}
				>
					{message}
				</div>
			)}

			<form onSubmit={handlePasswordChange} className="space-y-4">
				<div>
					<label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
						現在のパスワード
					</label>
					<input
						type="password"
						id="currentPassword"
						value={currentPassword}
						onChange={(e) => setCurrentPassword(e.target.value)}
						required
						className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
						新しいパスワード
					</label>
					<input
						type="password"
						id="newPassword"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						required
						minLength={6}
						className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
						新しいパスワード確認
					</label>
					<input
						type="password"
						id="confirmPassword"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
						minLength={6}
						className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
				>
					{loading ? '更新中...' : 'パスワードを変更'}
				</button>
			</form>

			<div className="text-center mt-4">
				<button onClick={() => navigate('/')} className="text-blue-500 hover:text-blue-600 text-sm">
					トップページに戻る
				</button>
			</div>
		</div>
	);
}
