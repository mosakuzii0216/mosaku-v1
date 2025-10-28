import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AuthTokenManager } from '../../utils/auth';

interface InvitationCode {
	id: string;
	code: string;
	maxUses: number;
	usedCount: number;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export default function InvitationManager() {
	const [invitations, setInvitations] = useState<InvitationCode[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [maxUses, setMaxUses] = useState(1);
	const [expiresAt, setExpiresAt] = useState('');
	const [message, setMessage] = useState('');

	useEffect(() => {
		loadInvitations();
	}, []);

	const loadInvitations = async () => {
		try {
			const token = AuthTokenManager.getAccessToken();

			if (!token || AuthTokenManager.isTokenExpired(token)) {
				setMessage('認証が必要です');
				return;
			}

			const response = await fetch('http://localhost/api/invitation', {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to load invitations');
			}

			const data = await response.json();
			setInvitations(data);
		} catch (error) {
			console.error('Error loading invitations:', error);
			setMessage(error instanceof Error ? error.message : 'Failed to load invitations');
		} finally {
			setLoading(false);
		}
	};

	const createInvitation = async (e: React.FormEvent) => {
		e.preventDefault();
		setCreating(true);
		setMessage('');

		try {
			const token = AuthTokenManager.getAccessToken();

			if (!token || AuthTokenManager.isTokenExpired(token)) {
				setMessage('認証が必要です');
				return;
			}

			const response = await fetch('http://localhost/api/invitation', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					maxUses,
					expiresAt: expiresAt || null,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to create invitation');
			}

			const newInvitation = await response.json();
			setInvitations([newInvitation, ...invitations]);
			setMaxUses(1);
			setExpiresAt('');
			setMessage('招待コードが作成されました');
		} catch (error) {
			console.error('Error creating invitation:', error);
			setMessage(error instanceof Error ? error.message : 'Failed to create invitation');
		} finally {
			setCreating(false);
		}
	};

	const deleteInvitation = async (id: string) => {
		if (!confirm('この招待コードを削除しますか？')) return;

		try {
			const token = AuthTokenManager.getAccessToken();

			if (!token || AuthTokenManager.isTokenExpired(token)) {
				setMessage('認証が必要です');
				return;
			}

			const response = await fetch(`http://localhost/api/invitation/${id}`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to delete invitation');
			}

			setInvitations(invitations.filter((inv) => inv.id !== id));
			setMessage('招待コードが削除されました');
		} catch (error) {
			console.error('Error deleting invitation:', error);
			setMessage(error instanceof Error ? error.message : 'Failed to delete invitation');
		}
	};

	const copyToClipboard = (code: string) => {
		navigator.clipboard.writeText(code);
		setMessage('招待コードをクリップボードにコピーしました');
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleString('ja-JP');
	};

	if (loading) {
		return (
			<div className="flex justify-center items-center min-h-screen">
				<div className="text-lg">読み込み中...</div>
			</div>
		);
	}

	return (
		<div className="max-w-6xl mx-auto p-6">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 space-y-4 sm:space-y-0">
				<h1 className="text-3xl font-bold">招待コード管理</h1>
				<Link
					to="/"
					className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center sm:justify-start"
				>
					<span className="mr-2">←</span>
					<span>トップページに戻る</span>
				</Link>
			</div>

			{message && (
				<div
					className={`mb-4 p-3 rounded-lg text-sm ${
						message.includes('作成されました') ||
						message.includes('削除されました') ||
						message.includes('コピーしました')
							? 'bg-green-100 text-green-700'
							: 'bg-red-100 text-red-700'
					}`}
				>
					{message}
				</div>
			)}

			<div className="bg-white rounded-lg shadow-md p-6 mb-6">
				<h2 className="text-xl font-semibold mb-4">新しい招待コードを作成</h2>

				<form onSubmit={createInvitation} className="space-y-4">
					<div>
						<label htmlFor="maxUses" className="block text-sm font-medium text-gray-700 mb-1">
							最大使用回数
						</label>
						<input
							type="number"
							id="maxUses"
							value={maxUses}
							onChange={(e) => setMaxUses(parseInt(e.target.value))}
							min="1"
							required
							className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label htmlFor="expiresAt" className="block text-sm font-medium text-gray-700 mb-1">
							有効期限（任意）
						</label>
						<input
							type="datetime-local"
							id="expiresAt"
							value={expiresAt}
							onChange={(e) => setExpiresAt(e.target.value)}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<button
						type="submit"
						disabled={creating}
						className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
					>
						{creating ? '作成中...' : '招待コードを作成'}
					</button>
				</form>
			</div>

			<div className="bg-white rounded-lg shadow-md p-6">
				<h2 className="text-xl font-semibold mb-4">既存の招待コード</h2>

				{invitations.length === 0 ? (
					<p className="text-gray-500 text-center py-8">招待コードがありません</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full table-auto">
							<thead>
								<tr className="bg-gray-50">
									<th className="px-4 py-2 text-left">招待コード</th>
									<th className="px-4 py-2 text-left">使用状況</th>
									<th className="px-4 py-2 text-left">有効期限</th>
									<th className="px-4 py-2 text-left">作成日</th>
									<th className="px-4 py-2 text-left">アクション</th>
								</tr>
							</thead>
							<tbody>
								{invitations.map((invitation) => (
									<tr key={invitation.id} className="border-t">
										<td className="px-4 py-2">
											<div className="flex items-center space-x-2">
												<code className="bg-gray-100 px-2 py-1 rounded text-sm">
													{invitation.code}
												</code>
												<button
													onClick={() => copyToClipboard(invitation.code)}
													className="text-blue-500 hover:text-blue-600 text-sm"
												>
													コピー
												</button>
											</div>
										</td>
										<td className="px-4 py-2">
											<span
												className={`px-2 py-1 rounded text-xs ${
													invitation.usedCount >= invitation.maxUses
														? 'bg-red-100 text-red-700'
														: 'bg-green-100 text-green-700'
												}`}
											>
												{invitation.usedCount}/{invitation.maxUses}
											</span>
										</td>
										<td className="px-4 py-2">
											{invitation.expiresAt ? (
												<span
													className={`${
														new Date(invitation.expiresAt) < new Date()
															? 'text-red-500'
															: 'text-gray-700'
													}`}
												>
													{formatDate(invitation.expiresAt)}
												</span>
											) : (
												<span className="text-gray-500">なし</span>
											)}
										</td>
										<td className="px-4 py-2 text-gray-600">{formatDate(invitation.createdAt)}</td>
										<td className="px-4 py-2">
											<button
												onClick={() => deleteInvitation(invitation.id)}
												className="text-red-500 hover:text-red-600 text-sm"
											>
												削除
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
