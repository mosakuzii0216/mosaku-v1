import { useState, useRef, useEffect } from 'react';
import { useViewStore } from '../../stores/useViewStore';
import { useNavigation } from '../../hooks/useNavigation';
import { LibraryBig, StickyNote, Tag, LogOut, Settings, Trash2, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router';
import { OfflineBadge } from './OfflineBadge';
import { useFeedbackStore } from '../../stores/useFeedbackStore';

interface HeaderProps {
	onMemoCreateClick?: () => void;
	onNotebookCreateClick?: () => void;
}

export const Header = (_props?: HeaderProps) => {
	const { currentView, currentObject } = useViewStore();
	const { goToMemoList, goToTags, goToNotebookList, goToTrash } = useNavigation();
	const { user, logout } = useAuth();
	const openFeedback = useFeedbackStore((s) => s.open);
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
		<header className="shell-surface border-b border-[var(--outline)] px-4 py-3 flex items-center justify-between">
			<div className="flex items-center">
				{currentView !== 'list' && (
					<button onClick={goToMemoList} className="shell-nav-item mr-3 md:hidden"></button>
				)}
				{/* ナビゲーションボタン */}
				<div className="ml-6 flex items-center space-x-2">
					<button
						onClick={goToMemoList}
						className={`shell-nav-item text-sm font-medium inline-flex items-center ${
							currentObject === 'memo' && currentView === 'list' ? 'is-active' : ''
						}`}
					>
						<StickyNote className="w-4 h-4 sm:mr-1.5" />
						<span className="hidden sm:inline">メモ</span>
					</button>
					<button
						onClick={goToNotebookList}
						className={`shell-nav-item text-sm font-medium inline-flex items-center ${
							currentObject === 'notebook' ? 'is-active' : ''
						}`}
					>
						<LibraryBig className="w-4 h-4 sm:mr-1.5" />
						<span className="hidden sm:inline">ノートブック</span>
					</button>
					<button
						onClick={goToTags}
						className={`shell-nav-item text-sm font-medium inline-flex items-center ${
							currentObject === 'tag' ? 'is-active' : ''
						}`}
					>
						<Tag className="w-4 h-4 sm:mr-1.5" />
						<span className="hidden sm:inline">タグ</span>
					</button>
					<button
						onClick={goToTrash}
						className={`shell-nav-item text-sm font-medium inline-flex items-center ${
							currentView === 'trash' ? 'is-active' : ''
						}`}
					>
						<Trash2 className="w-4 h-4 sm:mr-1.5" />
						<span className="hidden sm:inline">ゴミ箱</span>
					</button>
				</div>
			</div>

			<div className="flex items-center space-x-3">
				<OfflineBadge variant="header" />
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
							<div className="shell-panel absolute right-0 mt-2 w-64 py-2 px-0 z-50">
								{/* ユーザー情報 */}
								<div className="px-4 py-3 border-b border-[var(--outline)]">
									<div className="font-medium text-[var(--on-surface)]">
										{user.name || 'ユーザー'}
									</div>
									<div className="text-sm text-[var(--on-surface-variant)]">{user.email}</div>
									<div className="mt-1">
										<span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
											{user.role}
										</span>
									</div>
								</div>

								{/* メニューアイテム */}
								<Link
									to="/settings"
									onClick={() => setIsDropdownOpen(false)}
									className="w-full px-4 py-2 text-left text-sm text-[var(--on-surface)] hover:bg-[var(--state-hover)] flex items-center"
								>
									<Settings className="w-4 h-4 mr-3" />
									設定
								</Link>

								<button
									onClick={() => {
										setIsDropdownOpen(false);
										openFeedback();
									}}
									className="w-full px-4 py-2 text-left text-sm text-[var(--on-surface)] hover:bg-[var(--state-hover)] flex items-center"
								>
									<MessageSquare className="w-4 h-4 mr-3" />
									フィードバックを送る
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
