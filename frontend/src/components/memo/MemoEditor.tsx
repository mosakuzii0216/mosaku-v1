import { useState, useEffect, useCallback } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useCreateMemo, useUpdateMemo } from '../../hooks/useMemoQueries';
import { useTagQueries } from '../../hooks/useTagQueries';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { TagSelector } from '../tag/TagSelector';
import type { Memo } from '../../types/memo';

interface MemoEditorProps {
  memo?: Memo;
  isCreate?: boolean;
}

export const MemoEditor = ({ memo, isCreate = false }: MemoEditorProps) => {
  const { goToList, goToDetail } = useMemoStore();
  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();
  const { assignTags } = useTagQueries();
  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error: speechError,
  } = useSpeechRecognition();

  const [title, setTitle] = useState(memo?.title || '');
  const [content, setContent] = useState(memo?.content || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    memo?.memoTags?.map(mt => mt.tag.id) || []
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [activeField, setActiveField] = useState<'content' | null>(null);

  // 変更検知
  useEffect(() => {
    const originalTitle = memo?.title || '';
    const originalContent = memo?.content || '';
    const originalTagIds = memo?.memoTags?.map(mt => mt.tag.id) || [];
    const tagsChanged = JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
    setHasChanges(title !== originalTitle || content !== originalContent || tagsChanged);
  }, [title, content, selectedTagIds, memo]);

  const handleSave = useCallback(async () => {
    if (!title.trim() && !content.trim()) {
      return;
    }

    if (isCreate) {
      const result = await new Promise<Memo>((resolve, reject) => {
        createMemo.mutate({
          title: title.trim() || '無題',
          content: content.trim(),
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
        },
      });
      
      // タグの変更があれば更新
      const originalTagIds = memo.memoTags?.map(mt => mt.tag.id) || [];
      const tagsChanged = JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
      if (tagsChanged) {
        assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
      }
    }
  }, [title, content, selectedTagIds, isCreate, createMemo, memo, hasChanges, updateMemo, assignTags]);

  // 音声認識結果をコンテンツフィールドに反映
  useEffect(() => {
    if (transcript && activeField === 'content') {
      setContent(prev => prev + transcript);
      resetTranscript();
    }
  }, [transcript, activeField, resetTranscript]);

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

  const handleVoiceInput = () => {
    if (isListening) {
      stopListening();
      setActiveField(null);
    } else {
      setActiveField('content');
      startListening();
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
          
          {/* コンテンツ入力エリア */}
          <div className="relative flex-1 flex flex-col">
            <textarea
              placeholder="メモを入力..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 resize-none border-none outline-none placeholder-gray-400 dark:placeholder-gray-500 leading-relaxed bg-transparent pr-12 text-gray-900 dark:text-white"
              autoFocus={isCreate}
            />
            {isSupported && (
              <button
                onClick={handleVoiceInput}
                className={`absolute right-2 top-4 p-2 rounded-full transition-colors ${
                  isListening && activeField === 'content'
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
                title="音声入力"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
          
          {/* 音声認識エラー表示 */}
          {speechError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {speechError}
            </div>
          )}
          
          {/* 音声認識状態表示 */}
          {isListening && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
              🎤 音声認識中... コンテンツに入力されます
            </div>
          )}
          
          {/* ブラウザサポート警告 */}
          {!isSupported && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
              お使いのブラウザは音声認識をサポートしていません
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
