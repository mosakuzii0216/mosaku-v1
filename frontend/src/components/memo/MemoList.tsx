import { useMemoStore } from '../../stores/useMemoStore';
import { useMemos } from '../../hooks/useMemoQueries';
import { MemoItem } from './MemoItem';
import { MemoSearch } from './MemoSearch';

export const MemoList = () => {
  const { memos, searchQuery } = useMemoStore();
  const { isLoading, error } = useMemos();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500 dark:text-red-400">
          <div>エラーが発生しました</div>
          <div className="text-sm mt-2">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </div>
      </div>
    );
  }

  // ノートブック機能実装のため一時的に検索機能を無効化
  // const filteredMemos = searchQuery
  //   ? memos.filter(
  //       (memo) =>
  //         memo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
  //         memo.content.toLowerCase().includes(searchQuery.toLowerCase())
  //     )
  //   : memos;

  return (
    <div className="flex flex-col h-full">
      {/* ノートブック機能実装のため一時的に検索機能を無効化 */}
      {/* <MemoSearch /> */}
      
      <div className="flex-1 overflow-y-auto">
        <div>
          {memos.map((memo) => (
            <MemoItem key={memo.id} memo={memo} />
          ))}
        </div>
        {/* ノートブック機能実装のため一時的に検索機能を無効化 */}
        {/* {filteredMemos.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            {searchQuery ? '検索結果がありません' : 'メモがありません'}
          </div>
        ) : (
          <div>
            {filteredMemos.map((memo) => (
              <MemoItem key={memo.id} memo={memo} />
            ))}
          </div>
        )} */}
      </div>
    </div>
  );
};
