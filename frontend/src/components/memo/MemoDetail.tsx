import { useMemoStore } from '../../stores/useMemoStore';
import { useDeleteMemo } from '../../hooks/useMemoQueries';
import { useEffect } from 'react';
import { applyThemeToElement, removeThemeFromElement } from '../../utils/themeUtils';
import type { Memo } from '../../types/memo';

interface MemoDetailProps {
  memo: Memo;
}

export const MemoDetail = ({ memo }: MemoDetailProps) => {
  const { goToEdit, goToList } = useMemoStore();
  const deleteMemo = useDeleteMemo();

  // テーマの適用
  useEffect(() => {
    const container = document.getElementById(`memo-detail-${memo.id}`);
    if (container && memo.theme) {
      // Pick型のthemeオブジェクトを完全なTheme型に変換
      const fullTheme = {
        ...memo.theme,
        description: null,
        isSystem: true,
        isPublic: true,
        cssFilePath: '', // cssFilePathを追加
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdById: null,
        createdBy: null,
        favoriteCount: 0,
        usageCount: 0,
        isFavorited: false,
      };
      applyThemeToElement(container, fullTheme).catch(console.error);
    }
    
    return () => {
      if (container) {
        removeThemeFromElement(container);
      }
    };
  }, [memo.id, memo.theme]);

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
        <div 
          id={`memo-detail-${memo.id}`}
          className="max-w-4xl mx-auto"
          style={{
            backgroundColor: memo.theme ? 'var(--theme-bg-color)' : undefined,
            color: memo.theme ? 'var(--theme-text-color)' : undefined,
            fontFamily: memo.theme ? 'var(--theme-font-family)' : undefined,
            fontSize: memo.theme ? 'var(--theme-font-size)' : undefined,
            padding: memo.theme ? 'var(--theme-padding)' : undefined,
            borderRadius: memo.theme ? 'var(--theme-border-radius)' : undefined,
          }}
        >
          <h1 
            className="text-2xl font-bold mb-2 dark:text-white"
            style={{
              // color: memo.theme ? 'var(--theme-heading-color)' : undefined, まだテーマ機能が確定してないからコメントアウト
              fontFamily: memo.theme ? 'var(--theme-heading-font-family, var(--theme-font-family))' : undefined,
              fontSize: memo.theme ? 'var(--theme-heading-font-size)' : undefined,
              fontWeight: memo.theme ? 'var(--theme-heading-font-weight)' : undefined,
            }}
          >
            {memo.title || '無題'}
          </h1>
          
          {/* テーマ情報表示 */}
          {memo.theme && (
            <div className="mb-3 pb-3 border-b dark:text-white" style={{ borderColor: 'var(--theme-border-color)' }}>
              <span 
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: 'var(--theme-accent-color)',
                  color: 'var(--theme-bg-color)',
                }}
              >
                テーマ: {memo.theme.name}
              </span>
            </div>
          )}
          
          <div 
            className="text-sm mb-6 dark:text-white"
            // style={{ color: memo.theme ? 'var(--theme-subtext-color)' : undefined }} まだテーマ機能が確定してないからコメントアウト
          >
            作成: {formatDate(memo.createdAt)}
            {memo.updatedAt !== memo.createdAt && (
              <span className="ml-4">
                更新: {formatDate(memo.updatedAt)}
              </span>
            )}
          </div>

          <div 
            className="prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl max-w-none dark:text-white"
            style={{
              // color: memo.theme ? 'var(--theme-text-color)' : undefined, まだテーマ機能が確定してないからコメントアウト
              lineHeight: memo.theme ? 'var(--theme-line-height)' : undefined,
            }}
          >
            <div 
              className="leading-relaxed dark:text-white"
              style={{
                color: memo.theme ? 'var(--theme-text-color)' : undefined,
              }}
              dangerouslySetInnerHTML={{ __html: memo.content || 'コンテンツがありません' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
