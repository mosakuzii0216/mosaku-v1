import { useMemoStore } from '../../stores/useMemoStore';
import { useDeleteMemo } from '../../hooks/useMemoQueries';
import type { Memo } from '../../types/memo';

interface MemoDetailProps {
  memo: Memo;
}

export const MemoDetail = ({ memo }: MemoDetailProps) => {
  const { goToEdit, goToList } = useMemoStore();
  const deleteMemo = useDeleteMemo();

  const handleDelete = () => {
    if (window.confirm('このメモを削除しますか？')) {
      deleteMemo.mutate(memo.id);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* ヘッダー */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <button
          onClick={goToList}
          className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white md:hidden"
        >
          ← 戻る
        </button>
        
        <div className="flex space-x-2">
          <button
            onClick={() => goToEdit(memo)}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            編集
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMemo.isPending}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {deleteMemo.isPending ? '削除中...' : '削除'}
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {memo.title || '無題'}
          </h1>
          
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            作成: {formatDate(memo.createdAt)}
            {memo.updatedAt !== memo.createdAt && (
              <span className="ml-4">
                更新: {formatDate(memo.updatedAt)}
              </span>
            )}
          </div>

          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">
              {memo.content || 'コンテンツがありません'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
