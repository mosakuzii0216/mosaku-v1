import { useState, useEffect, useCallback } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useCreateMemo, useUpdateMemo } from '../../hooks/useMemoQueries';
import { useTagQueries } from '../../hooks/useTagQueries';
import { TagSelector } from '../tag/TagSelector';
import { ThemeSelector } from '../theme/ThemeSelector';
import { RichTextEditor } from '../editor/RichTextEditor';
import type { Memo } from '../../types/memo';
import type { Theme } from '../../types/theme';

interface MemoEditorProps {
  memo?: Memo;
  isCreate?: boolean;
}

export const MemoEditor = ({ memo, isCreate = false }: MemoEditorProps) => {
  const { goToList, goToDetail } = useMemoStore();
  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();
  const { assignTags } = useTagQueries();

  const [title, setTitle] = useState(memo?.title || '');
  const [content, setContent] = useState(memo?.content || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    memo?.memoTags?.map(mt => mt.tag.id) || []
  );
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(
    memo?.theme ? {
      ...memo.theme,
      description: null,
      isSystem: true,
      isPublic: true,
      createdAt: '',
      updatedAt: '',
      createdById: null,
      createdBy: null,
      favoriteCount: 0,
      usageCount: 0,
    } as Theme : null
  );
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 変更検知
  useEffect(() => {
    const originalTitle = memo?.title || '';
    const originalContent = memo?.content || '';
    const originalTagIds = memo?.memoTags?.map(mt => mt.tag.id) || [];
    const originalThemeId = memo?.themeId || null;
    
    const tagsChanged = JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
    const themeChanged = selectedTheme?.id !== originalThemeId;
    
    setHasChanges(
      title !== originalTitle || 
      content !== originalContent || 
      tagsChanged || 
      themeChanged
    );
  }, [title, content, selectedTagIds, selectedTheme, memo]);

  const handleSave = useCallback(async () => {
    if (!title.trim() && !content.trim()) {
      return;
    }

    if (isCreate) {
      const result = await new Promise<Memo>((resolve, reject) => {
        createMemo.mutate({
          title: title.trim() || '無題',
          content: content.trim(),
          themeId: selectedTheme?.id,
        }, {
          onSuccess: resolve,
          onError: reject,
        });
      });
      
      // 新規作成後にタグを割り当て
      if (selectedTagIds.length > 0) {
        assignTags({ memoId: result.id, data: { tagIds: selectedTagIds } });
      }
    } else if (memo && hasChanges) {
      updateMemo.mutate({
        id: memo.id,
        data: {
          title: title.trim() || '無題',
          content: content.trim(),
          themeId: selectedTheme?.id,
        },
      });
      
      // タグの変更があれば更新
      const originalTagIds = memo.memoTags?.map(mt => mt.tag.id) || [];
      const tagsChanged = JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
      if (tagsChanged) {
        assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
      }
    }
  }, [title, content, selectedTagIds, selectedTheme, isCreate, createMemo, memo, hasChanges, updateMemo, assignTags]);


  // 自動保存（新規作成・編集共通）
  useEffect(() => {
    if (hasChanges && (title.trim() || content.trim())) {
      const timer = setTimeout(() => {
        handleSave();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [title, content, hasChanges, handleSave]);

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



  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between bg-white dark:bg-gray-900">
        <button
          onClick={handleCancel}
          className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          ← {isCreate ? 'キャンセル' : '戻る'}
        </button>
        
        <div className="flex items-center space-x-2">
          {hasChanges && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              自動保存中...
            </span>
          )}
        </div>
      </div>

      {/* エディター */}
      <div className="flex-1 flex flex-col p-4 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
          {/* タイトル入力エリア */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="タイトルを入力..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-bold border-none outline-none placeholder-gray-400 dark:placeholder-gray-500 bg-transparent w-full text-gray-900 dark:text-white"
            />
          </div>

          {/* タグ選択エリア */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              タグ
            </label>
            <TagSelector
              selectedTagIds={selectedTagIds}
              onTagsChange={setSelectedTagIds}
              className="w-full"
            />
          </div>

          {/* テーマ選択エリア（新規作成時のみ） */}
          {isCreate && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  テーマ
                </label>
                <button
                  type="button"
                  onClick={() => setShowThemeSelector(!showThemeSelector)}
                  className="text-sm text-blue-500 hover:text-blue-600"
                >
                  {showThemeSelector ? 'テーマ選択を閉じる' : 'テーマを選択'}
                </button>
              </div>
              
              {/* 選択されたテーマの表示 */}
              {selectedTheme && (
                <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      選択中: {selectedTheme.name}
                    </span>
                    <button
                      onClick={() => setSelectedTheme(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      解除
                    </button>
                  </div>
                </div>
              )}

              {/* テーマ選択UI */}
              {showThemeSelector && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <ThemeSelector
                    selectedThemeId={selectedTheme?.id}
                    onThemeSelect={(theme) => {
                      setSelectedTheme(theme);
                      setShowThemeSelector(false);
                    }}
                    showFavorites={true}
                    className="max-h-80"
                  />
                </div>
              )}
            </div>
          )}
          
          {/* コンテンツ入力エリア */}
          <div className="relative flex-1 flex flex-col">
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="メモを入力..."
              className="flex-1"
            />
          </div>
          
        </div>
      </div>
    </div>
  );
};
