import { useMemoStore } from '../../stores/useMemoStore';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onMemoCreateClick: () => void;
}

export const Header = ({ onMemoCreateClick }: HeaderProps) => {
  const { currentView, goToList, goToTags } = useMemoStore();
  const { user, logout } = useAuth();
  
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
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
            onClick={goToList}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              currentView === 'list' || currentView === 'detail' || currentView === 'edit' || currentView === 'create'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            📝 メモ
          </button>
          <button
            onClick={goToTags}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              currentView === 'tags'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            🏷️ タグ
          </button>
        </div>
      </div>
      
      <div className="flex items-center space-x-3">
        <ThemeToggle />
        {user && (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {user.name || user.email} ({user.role})
          </span>
        )}
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
        <button
          onClick={() => {console.log('notebook create button clicked')}}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ノートブック作成
        </button>
        <button
          onClick={onMemoCreateClick}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + 新規作成
        </button>
        <button
          onClick={logout}
          className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
};
