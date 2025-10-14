import { useEffect } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useAppInit } from '../../hooks/useAppInit';
import { Header } from '../ui/Header';
import { MemoList } from '../memo/MemoList';
import { MemoDetail } from '../memo/MemoDetail';
import { MemoEditor } from '../memo/MemoEditor';
import { TagManager } from '../tag/TagManager';

export const MobileLayout = () => {
  const { currentView, selectedMemo, goToMemoCreate, goToNotebookCreate } = useMemoStore();
  useAppInit(); // アプリ初期化（タグロード等）

  // ショートカットキーのハンドリング
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // OSやキーボードレイアウトによって e.key が 'n' にならない場合があるため、
      // 物理キーコードである e.code で判定する
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyN') {
        e.preventDefault();
        goToMemoCreate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [goToMemoCreate]);

  const renderContent = () => {
    switch (currentView) {
      case 'list':
        return <MemoList />;
      
      case 'detail':
        return selectedMemo ? (
          <MemoDetail memo={selectedMemo} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <p>メモが選択されていません</p>
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
              新規作成: {/Mac|iPod|iPhone|iPad/.test(window.navigator.platform) ? 'Cmd + Option' : 'Ctrl + Alt'} + N
            </p>
          </div>
        );
      
      case 'edit':
        return selectedMemo ? (
          <MemoEditor memo={selectedMemo} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <p>メモが選択されていません</p>
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
              新規作成: {/Mac|iPod|iPhone|iPad/.test(window.navigator.platform) ? 'Cmd + Option' : 'Ctrl + Alt'} + N
            </p>
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
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      <Header onMemoCreateClick={goToMemoCreate} onNotebookCreateClick={goToNotebookCreate} />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
    </div>
  );
};
