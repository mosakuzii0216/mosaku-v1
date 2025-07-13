import { useMemoStore } from '../../stores/useMemoStore';
import { useAppInit } from '../../hooks/useAppInit';
import { Header } from '../ui/Header';
import { MemoList } from '../memo/MemoList';
import { MemoDetail } from '../memo/MemoDetail';
import { MemoEditor } from '../memo/MemoEditor';
import { TagManager } from '../tag/TagManager';

export const MobileLayout = () => {
  const { currentView, selectedMemo, goToCreate } = useMemoStore();
  useAppInit(); // アプリ初期化（タグロード等）

  const renderContent = () => {
    switch (currentView) {
      case 'list':
        return <MemoList />;
      
      case 'detail':
        return selectedMemo ? (
          <MemoDetail memo={selectedMemo} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            メモが選択されていません
          </div>
        );
      
      case 'edit':
        return selectedMemo ? (
          <MemoEditor memo={selectedMemo} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            メモが選択されていません
          </div>
        );
      
      case 'create':
        return <MemoEditor isCreate />;
      
      case 'tags':
        return <TagManager />;
      
      default:
        return <MemoList />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <Header onCreateClick={goToCreate} />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
    </div>
  );
};
