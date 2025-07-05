import { useMemoStore } from '../../stores/useMemoStore';
import { useAuth } from '../../hooks/useAuth';

interface HeaderProps {
  onCreateClick: () => void;
}

export const Header = ({ onCreateClick }: HeaderProps) => {
  const { currentView, goToList } = useMemoStore();
  const { userProfile, signOut } = useAuth();

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
        <h1 className="text-xl font-semibold text-gray-900">
          メモアプリ
        </h1>
      </div>
      
      <div className="flex items-center space-x-3">
        {userProfile && (
          <span className="text-sm text-gray-600">
            {userProfile.name || userProfile.email} ({userProfile.role})
          </span>
        )}
        <button
          onClick={onCreateClick}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + 新規作成
        </button>
        <button
          onClick={signOut}
          className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
};
