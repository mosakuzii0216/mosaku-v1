import { useState, useEffect } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useCreateMemo, useUpdateMemo } from '../../hooks/useMemoQueries';
import type { Memo } from '../../types/memo';

interface MemoEditorProps {
  memo?: Memo;
  isCreate?: boolean;
}

export const MemoEditor = ({ memo, isCreate = false }: MemoEditorProps) => {
  const { goToList, goToDetail } = useMemoStore();
  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();

  const [title, setTitle] = useState(memo?.title || '');
  const [content, setContent] = useState(memo?.content || '');
  const [hasChanges, setHasChanges] = useState(false);

  // 変更検知
  useEffect(() => {
    const originalTitle = memo?.title || '';
    const originalContent = memo?.content || '';
    setHasChanges(title !== originalTitle || content !== originalContent);
  }, [title, content, memo]);

  // 自動保存（既存メモの場合のみ）
  useEffect(() => {
    if (!isCreate && memo && hasChanges) {
      const timer = setTimeout(() => {
        handleSave();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [title, content, hasChanges, isCreate, memo]);

  const handleSave = () => {
    if (!title.trim() && !content.trim()) {
      return;
    }

    if (isCreate) {
      createMemo.mutate({
        title: title.trim() || '無題',
        content: content.trim(),
      });
    } else if (memo && hasChanges) {
      updateMemo.mutate({
        id: memo.id,
        data: {
          title: title.trim() || '無題',
          content: content.trim(),
        },
      });
    }
  };

  const handleCancel = () => {
    if (hasChanges && !window.confirm('変更が保存されていません。破棄しますか？')) {
      return;
    }

    if (isCreate) {
      goToList();
    } else if (memo) {
      goToDetail(memo);
    }
  };

  const isLoading = createMemo.isPending || updateMemo.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="border-b border-gray-200 p-4 flex items-center justify-between">
        <button
          onClick={handleCancel}
          className="p-2 text-gray-600 hover:text-gray-900"
        >
          ← {isCreate ? 'キャンセル' : '戻る'}
        </button>
        
        <div className="flex items-center space-x-2">
          {!isCreate && hasChanges && (
            <span className="text-sm text-gray-500">
              自動保存中...
            </span>
          )}
          
          {isCreate && (
            <button
              onClick={handleSave}
              disabled={isLoading || (!title.trim() && !content.trim())}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </div>

      {/* エディター */}
      <div className="flex-1 flex flex-col p-4">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
          <input
            type="text"
            placeholder="タイトルを入力..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-2xl font-bold border-none outline-none placeholder-gray-400 mb-4 bg-transparent"
          />
          
          <textarea
            placeholder="メモを入力..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 resize-none border-none outline-none placeholder-gray-400 leading-relaxed bg-transparent"
            autoFocus={isCreate}
          />
        </div>
      </div>
    </div>
  );
};
