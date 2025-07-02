import { useMemoStore } from '../../stores/useMemoStore';
import { Header } from '../ui/Header';
import { MemoList } from '../memo/MemoList';
import { MemoDetail } from '../memo/MemoDetail';
import { MemoEditor } from '../memo/MemoEditor';

export const MobileLayout = () => {
  const { currentView, selectedMemo, goToCreate } = useMemoStore();

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
