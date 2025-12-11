import { useState, useRef, useEffect } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { LibraryBig, Tag, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

interface HeaderProps {
	onMemoCreateClick?: () => void;
	onNotebookCreateClick?: () => void;
}

export const Header = (_props?: HeaderProps) => {
	const { currentView, currentObject, goToList, goToTags, goToNotebookList } = useMemoStore();
	const { user, logout } = useAuth();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// ドロップダウン外クリックで閉じる
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsDropdownOpen(false);
			}
		};

		if (isDropdownOpen) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isDropdownOpen]);

	// ユーザーの頭文字を取得
	const getUserInitial = () => {
		if (user?.name) {
			return user.name.charAt(0).toUpperCase();
		}
		if (user?.email) {
			return user.email.charAt(0).toUpperCase();
		}
		return 'U';
	};

	return (
		<header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
			<div className="flex items-center">
				{currentView !== 'list' && (
					<button
						onClick={goToList}
						className="mr-3 p-2 text-gray-600 hover:text-gray-900 md:hidden"
					>
						←
					</button>
				)}
				{/* ナビゲーションボタン */}
				<div className="ml-6 flex items-center space-x-2">
					<button
						onClick={goToNotebookList}
						className={`px-3 py-2 rounded text-sm font-medium transition-colors inline-flex items-center ${
							currentObject === 'notebook'
								? 'bg-blue-100 text-blue-800'
								: 'text-gray-600 hover:text-gray-900'
						}`}
					>
						<LibraryBig className="w-4 h-4 mr-1.5" /> ノートブック
					</button>
					<button
						onClick={goToTags}
						className={`px-3 py-2 rounded text-sm font-medium transition-colors inline-flex items-center ${
							currentObject === 'tag'
								? 'bg-blue-100 text-blue-800'
								: 'text-gray-600 hover:text-gray-900'
						}`}
					>
						<Tag className="w-4 h-4 mr-1.5" /> タグ
					</button>
				</div>
			</div>

			<div className="flex items-center space-x-3">
				{user?.role === 'ADMIN' && (
					<Link
						to="/admin/invitations"
						className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center"
						title="招待コード管理"
					>
						<span className="hidden sm:inline">📧 招待コード管理</span>
						<span className="sm:hidden">📧</span>
					</Link>
				)}
				{/* ユーザーアイコン */}
				{user && (
					<div className="relative" ref={dropdownRef}>
						<button
							onClick={() => setIsDropdownOpen(!isDropdownOpen)}
							className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-gray-600 text-white font-semibold flex items-center justify-center hover:shadow-lg transition-shadow"
							title={user.name || user.email || 'User'}
						>
							{getUserInitial()}
						</button>

						{/* ドロップダウンメニュー */}
						{isDropdownOpen && (
							<div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
								{/* ユーザー情報 */}
								<div className="px-4 py-3 border-b border-gray-100">
									<div className="font-medium text-gray-900">{user.name || 'ユーザー'}</div>
									<div className="text-sm text-gray-500">{user.email}</div>
									<div className="mt-1">
										<span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
											{user.role}
										</span>
									</div>
								</div>

								{/* メニューアイテム */}
								<button
									onClick={() => {
										setIsDropdownOpen(false);
										// TODO: 設定画面への遷移
									}}
									className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
								>
									<Settings className="w-4 h-4 mr-3" />
									設定
								</button>

								<button
									onClick={() => {
										setIsDropdownOpen(false);
										logout();
									}}
									className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
								>
									<LogOut className="w-4 h-4 mr-3" />
									ログアウト
								</button>
							</div>
						)}
					</div>
				)}
			</div>
		</header>
	);
};
