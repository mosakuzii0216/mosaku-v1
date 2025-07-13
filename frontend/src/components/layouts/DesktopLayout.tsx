import { useMemoStore } from '../../stores/useMemoStore';
import { useAppInit } from '../../hooks/useAppInit';
import { Header } from '../ui/Header';
import { MemoList } from '../memo/MemoList';
import { MemoDetail } from '../memo/MemoDetail';
import { MemoEditor } from '../memo/MemoEditor';
import { TagManager } from '../tag/TagManager';

export const DesktopLayout = () => {
  const { currentView, selectedMemo, goToCreate } = useMemoStore();
  useAppInit(); // アプリ初期化（タグロード等）

  const renderMainContent = () => {
    switch (currentView) {
      case 'detail':
        return selectedMemo ? (
          <MemoDetail memo={selectedMemo} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            メモを選択してください
          </div>
        );
      
      case 'edit':
        return selectedMemo ? (
          <MemoEditor memo={selectedMemo} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            メモが選択されていません
          </div>
        );
      
      case 'create':
        return <MemoEditor isCreate />;
      
      case 'tags':
        return <TagManager />;
      
      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            メモを選択してください
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      <Header onCreateClick={goToCreate} />
      
      <main className="flex-1 flex overflow-hidden">
        {/* 左サイドバー - メモ一覧 (タグ管理時は非表示) */}
        {currentView !== 'tags' && (
          <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
            <MemoList />
          </div>
        )}
        
        {/* 右メインエリア - メモ詳細/編集 */}
        <div className="flex-1 flex flex-col">
          {renderMainContent()}
        </div>
      </main>
    </div>
  );
};
