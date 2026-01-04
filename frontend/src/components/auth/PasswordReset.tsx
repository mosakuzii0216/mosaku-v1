import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PasswordInput } from '../ui/PasswordInput';
import { validatePasswordStrength } from '../../utils/passwordValidator';
import { logger } from '../../utils/logger';

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

		// パスワード強度検証
		const validation = validatePasswordStrength(newPassword);
		if (!validation.isValid) {
			setMessage(`パスワードが要件を満たしていません: ${validation.errors.join(', ')}`);
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
			logger.error('パスワード変更エラー:', error);
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
				<PasswordInput
					id="currentPassword"
					label="現在のパスワード"
					value={currentPassword}
					onChange={setCurrentPassword}
					required
					autoComplete="current-password"
				/>

				<PasswordInput
					id="newPassword"
					label="新しいパスワード"
					value={newPassword}
					onChange={setNewPassword}
					required
					showStrengthIndicator
					autoComplete="new-password"
				/>

				<PasswordInput
					id="confirmPassword"
					label="新しいパスワード確認"
					value={confirmPassword}
					onChange={setConfirmPassword}
					required
					autoComplete="new-password"
				/>

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
