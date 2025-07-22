import { useState, useEffect, useCallback } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useCreateMemo, useUpdateMemo } from '../../hooks/useMemoQueries';
import { useTagQueries } from '../../hooks/useTagQueries';
import { applyThemeToElement, removeThemeFromElement } from '../../utils/themeUtils';
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
      description: memo.theme.description || null,
      isSystem: true,
      isPublic: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdById: null,
      createdBy: null,
      favoriteCount: 0,
      usageCount: 0,
      isFavorited: false,
    } as Theme : null
  );
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // テーマの適用
  useEffect(() => {
    const container = document.getElementById(`memo-editor-${memo?.id || 'new'}`);
    if (container && selectedTheme) {
      // Pick型またはテーマオブジェクトを完全なTheme型に変換
      const fullTheme = {
        ...selectedTheme,
        description: selectedTheme.description || null,
        isSystem: selectedTheme.isSystem ?? true,
        isPublic: selectedTheme.isPublic ?? true,
        createdAt: selectedTheme.createdAt || new Date().toISOString(),
        updatedAt: selectedTheme.updatedAt || new Date().toISOString(),
        createdById: selectedTheme.createdById || null,
        createdBy: selectedTheme.createdBy || null,
        favoriteCount: selectedTheme.favoriteCount || 0,
        usageCount: selectedTheme.usageCount || 0,
        isFavorited: selectedTheme.isFavorited ?? false,
      };
      applyThemeToElement(container, fullTheme);
    } else if (container) {
      removeThemeFromElement(container);
    }
    
    return () => {
      if (container) {
        removeThemeFromElement(container);
      }
    };
  }, [selectedTheme, memo?.id]);

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
        <div 
          id={`memo-editor-${memo?.id || 'new'}`}
          className="max-w-4xl mx-auto w-full flex-1 flex flex-col"
          style={{
            backgroundColor: selectedTheme ? 'var(--theme-bg-color)' : undefined,
            color: selectedTheme ? 'var(--theme-text-color)' : undefined,
            fontFamily: selectedTheme ? 'var(--theme-font-family)' : undefined,
            fontSize: selectedTheme ? 'var(--theme-font-size)' : undefined,
            padding: selectedTheme ? 'var(--theme-padding)' : undefined,
            borderRadius: selectedTheme ? 'var(--theme-border-radius)' : undefined,
          }}
        >
          {/* タイトル入力エリア */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="タイトルを入力..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-bold border-none outline-none placeholder-gray-400 dark:placeholder-gray-500 bg-transparent w-full"
              style={{
                color: selectedTheme ? 'var(--theme-heading-color)' : undefined,
                fontFamily: selectedTheme ? 'var(--theme-heading-font-family, var(--theme-font-family))' : undefined,
                fontSize: selectedTheme ? 'var(--theme-heading-font-size)' : undefined,
                fontWeight: selectedTheme ? 'var(--theme-heading-font-weight)' : undefined,
              }}
            />
          </div>

          {/* タグ選択エリア */}
          <div className="mb-4">
            <label 
              className="block text-sm font-medium mb-2"
              style={{ color: selectedTheme ? 'var(--theme-subtext-color)' : undefined }}
            >
              タグ
            </label>
            <TagSelector
              selectedTagIds={selectedTagIds}
              onTagsChange={setSelectedTagIds}
              className="w-full"
            />
          </div>

          {/* テーマ表示・選択エリア */}
          {(isCreate || selectedTheme) && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label 
                  className="block text-sm font-medium"
                  style={{ color: selectedTheme ? 'var(--theme-subtext-color)' : undefined }}
                >
                  テーマ
                </label>
                {isCreate && (
                  <button
                    type="button"
                    onClick={() => setShowThemeSelector(!showThemeSelector)}
                    className="text-sm hover:opacity-80"
                    style={{ 
                      color: selectedTheme ? 'var(--theme-accent-color)' : undefined,
                    }}
                  >
                    {showThemeSelector ? 'テーマ選択を閉じる' : 'テーマを選択'}
                  </button>
                )}
                {!isCreate && selectedTheme && (
                  <span 
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      backgroundColor: selectedTheme ? 'var(--theme-accent-color)' : undefined,
                      color: selectedTheme ? 'var(--theme-bg-color)' : undefined,
                    }}
                  >
                    既存テーマ適用中
                  </span>
                )}
              </div>
              
              {/* 選択されたテーマの表示 */}
              {selectedTheme && (
                <div 
                  className="mb-3 p-3 rounded-lg"
                  style={{
                    backgroundColor: selectedTheme ? 'var(--theme-hover-bg-color)' : undefined,
                    border: selectedTheme ? `1px solid var(--theme-border-color)` : undefined,
                    borderRadius: selectedTheme ? 'var(--theme-border-radius)' : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span 
                      className="text-sm font-medium"
                      style={{ color: selectedTheme ? 'var(--theme-text-color)' : undefined }}
                    >
                      選択中: {selectedTheme.name}
                    </span>
                    {isCreate && (
                      <button
                        onClick={() => setSelectedTheme(null)}
                        className="text-sm hover:opacity-70"
                        style={{ color: selectedTheme ? 'var(--theme-subtext-color)' : undefined }}
                      >
                        解除
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* テーマ選択UI（新規作成時のみ） */}
              {isCreate && showThemeSelector && (
                <div 
                  className="rounded-lg p-4 max-h-96 overflow-y-auto"
                  style={{
                    border: selectedTheme ? `1px solid var(--theme-border-color)` : undefined,
                    borderRadius: selectedTheme ? 'var(--theme-border-radius)' : undefined,
                  }}
                >
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
          <div 
            className="relative flex-1 flex flex-col"
            style={{
              borderTop: selectedTheme ? `1px solid var(--theme-border-color)` : undefined,
              marginTop: selectedTheme ? 'var(--theme-margin)' : undefined,
              paddingTop: selectedTheme ? 'var(--theme-padding)' : undefined,
            }}
          >
            <div
              className="flex-1"
              style={{
                color: selectedTheme ? 'var(--theme-text-color)' : undefined,
                fontFamily: selectedTheme ? 'var(--theme-font-family)' : undefined,
                fontSize: selectedTheme ? 'var(--theme-font-size)' : undefined,
                lineHeight: selectedTheme ? 'var(--theme-line-height)' : undefined,
              }}
            >
              <RichTextEditor
                content={content}
                onChange={setContent}
                placeholder="メモを入力..."
                className="h-full"
              />
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};
