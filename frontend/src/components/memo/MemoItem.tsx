import type { Memo } from '../../types/memo';
import { useMemoStore } from '../../stores/useMemoStore';
import { TagChip } from '../tag/TagChip';

interface MemoItemProps {
  memo: Memo;
}

export const MemoItem = ({ memo }: MemoItemProps) => {
  const { goToDetail } = useMemoStore();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      return date.toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const getPreview = (content: string) => {
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  };

  return (
    <div
      onClick={() => goToDetail(memo)}
      className="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-gray-900 truncate flex-1 mr-2">
          {memo.title || '無題'}
        </h3>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {formatDate(memo.updatedAt)}
        </span>
      </div>
      
      {memo.content && (
        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
          {getPreview(memo.content)}
        </p>
      )}

      {/* タグ表示 */}
      {memo.memoTags && memo.memoTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {memo.memoTags.map((memoTag) => (
            <TagChip
              key={memoTag.tag.id}
              tag={memoTag.tag}
              onClick={(e) => e?.stopPropagation()}
            />
          ))}
        </div>
      )}
    </div>
  );
};
