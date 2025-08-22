import { useEffect } from 'react';
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

  // ショートカットキーのハンドリング
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // OSやキーボードレイアウトによって e.key が 'n' にならない場合があるため、
      // 物理キーコードである e.code で判定する
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyN') {
        e.preventDefault();
        goToCreate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [goToCreate]);

  const renderMainContent = () => {
    switch (currentView) {
      case 'detail':
        return selectedMemo ? (
          <MemoDetail memo={selectedMemo} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <p>メモを選択してください</p>
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
              新規作成: {/Mac|iPod|iPhone|iPad/.test(window.navigator.platform) ? 'Cmd + Option' : 'Ctrl + Alt'} + N
            </p>
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
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <p>メモを選択してください</p>
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
              新規作成: {/Mac|iPod|iPhone|iPad/.test(window.navigator.platform) ? 'Cmd + Option' : 'Ctrl + Alt'} + N
            </p>
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
