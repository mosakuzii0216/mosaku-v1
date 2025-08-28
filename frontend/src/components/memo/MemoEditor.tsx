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
      applyThemeToElement(container, fullTheme).catch(console.error);
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

    try {
      if (isCreate) {
        const result = await new Promise<Memo>((resolve, reject) => {
          createMemo.mutate({
            title: title.trim() || '無題',
            content: content.trim(),
            themeId: selectedTheme?.id || null,
          }, {
            onSuccess: resolve,
            onError: reject,
          });
        });
        
        // 新規作成後にタグを割り当て
        if (selectedTagIds.length > 0) {
          assignTags({ memoId: result.id, data: { tagIds: selectedTagIds } });
        }
        
        // 新規作成完了後、詳細画面に遷移
        goToDetail(result);
      } else if (memo && hasChanges) {
        await new Promise<Memo>((resolve, reject) => {
          updateMemo.mutate({
            id: memo.id,
            data: {
              title: title.trim() || '無題',
              content: content.trim(),
              themeId: selectedTheme?.id || null,
            },
          }, {
            onSuccess: resolve,
            onError: reject,
          });
        });
        
        // タグの変更があれば更新
        const originalTagIds = memo.memoTags?.map(mt => mt.tag.id) || [];
        const tagsChanged = JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
        if (tagsChanged) {
          assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
        }
        
        // 更新完了後、詳細画面に戻る
        goToDetail({
          ...memo,
          title: title.trim() || '無題',
          content: content.trim(),
          themeId: selectedTheme?.id || null,
          theme: selectedTheme ? {
            id: selectedTheme.id,
            name: selectedTheme.name,
            styles: selectedTheme.styles
          } : null,
        });
      }
    } catch (error) {
      console.error('保存に失敗しました:', error);
      // エラーハンドリング - ユーザーにエラーを通知
      alert('保存に失敗しました。もう一度お試しください。');
    }
  }, [title, content, selectedTagIds, selectedTheme, isCreate, createMemo, memo, hasChanges, updateMemo, assignTags, goToDetail]);

  // キーボードショートカット（Ctrl+S / Cmd+S で保存）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (hasChanges && (title.trim() || content.trim())) {
          handleSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, title, content, handleSave]);

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
              未保存の変更があります
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || (!title.trim() && !content.trim()) || createMemo.isPending || updateMemo.isPending}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMemo.isPending || updateMemo.isPending ? '保存中...' : '保存'}
          </button>
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
              placeholder="タイトル"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-bold border-none outline-none placeholder-gray-400 dark:text-white bg-transparent w-full"
              style={{
                // color: selectedTheme ? 'var(--theme-heading-color)' : undefined, まだテーマ機能が確定してないからコメントアウト
                fontFamily: selectedTheme ? 'var(--theme-heading-font-family, var(--theme-font-family))' : undefined,
                fontSize: selectedTheme ? 'var(--theme-heading-font-size)' : undefined,
                fontWeight: selectedTheme ? 'var(--theme-heading-font-weight)' : undefined,
              }}
            />
          </div>

          {/* タグ選択エリア */}
          <div className="mb-4">
            <label 
              className="block text-sm font-medium mb-2 dark:text-white"
              // style={{ color: selectedTheme ? 'var(--theme-subtext-color)' : undefined }} まだテーマ機能が確定してないからコメントアウト
            >
              タグ
            </label>
            <TagSelector
              selectedTagIds={selectedTagIds}
              onTagsChange={setSelectedTagIds}
              className="w-full"
            />
          </div>

          {/* テーマ選択エリア */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label 
                className="block text-sm font-medium dark:text-white"
                // style={{ color: selectedTheme ? 'var(--theme-subtext-color)' : undefined }} まだテーマ機能が確定してないからコメントアウト
              >
                テーマ
              </label>
              <button
                type="button"
                onClick={() => setShowThemeSelector(!showThemeSelector)}
                className="text-sm hover:opacity-80 dark:text-white"
                style={{ 
                  // color: selectedTheme ? 'var(--theme-accent-color)' : undefined, まだテーマ機能が確定してないからコメントアウト
                }}
              >
                {showThemeSelector ? 'テーマ選択を閉じる' : selectedTheme ? 'テーマを変更' : 'テーマを選択'}
              </button>
            </div>
              
            {/* 選択されたテーマの表示またはテーマなしの表示 */}
            {selectedTheme ? (
              <div 
                className="mb-3 p-3 rounded-lg"
                style={{
                  backgroundColor: selectedTheme ? 'var(--theme-hover-bg-color)' : undefined,
                  border: selectedTheme ? `1px solid var(--theme-border-color)` : undefined,
                  borderRadius: selectedTheme ? 'var(--theme-border-radius)' : undefined,
                }}
              >
                <div className="flex items-center justify-between dark:text-white">
                  <div className="flex items-center space-x-2">
                    <span 
                      className="text-sm font-medium"
                      style={{ color: selectedTheme ? 'var(--theme-text-color)' : undefined }}
                    >
                      選択中: {selectedTheme.name}
                    </span>
                    {!isCreate && (
                      <span 
                        className="text-xs px-2 py-1 rounded"
                        style={{
                          backgroundColor: selectedTheme ? 'var(--theme-accent-color)' : undefined,
                          color: selectedTheme ? 'var(--theme-bg-color)' : undefined,
                        }}
                      >
                        変更可能
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedTheme(null)}
                    className="text-sm hover:opacity-70"
                    style={{ color: selectedTheme ? 'var(--theme-subtext-color)' : undefined }}
                  >
                    解除
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    テーマが設定されていません
                  </span>
                  <button
                    onClick={() => setShowThemeSelector(true)}
                    className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400"
                  >
                    テーマを選択
                  </button>
                </div>
              </div>
            )}

            {/* テーマ選択UI */}
            {showThemeSelector && (
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
