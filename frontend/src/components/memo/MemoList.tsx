import { useMemo } from 'react';
import { useMemos } from '../../hooks/useMemoQueries';
import { useViewStore } from '../../stores/useViewStore';
import { useNavigation } from '../../hooks/useNavigation';
import { MemoItem } from './MemoItem';

export const MemoList = () => {
	const { data: memos = [], isLoading, error } = useMemos();
	const { notebookFilter } = useViewStore();
	const { goToEdit } = useNavigation();

	// notebookFilterに基づいてメモをフィルタリング
	const filteredMemos = useMemo(() => {
		return memos.filter((memo) => {
			if (notebookFilter === 'ALL') {
				return true;
			} else if (notebookFilter === 'INBOX') {
				return !memo.notebookId;
			} else {
				return memo.notebookId === notebookFilter;
			}
		});
	}, [memos, notebookFilter]);

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-gray-500">読み込み中...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-red-500">
					<div>エラーが発生しました</div>
					<div className="text-sm mt-2">
						{error instanceof Error ? error.message : 'Unknown error'}
					</div>
				</div>
			</div>
		);
	}

	if (filteredMemos.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-gray-500">メモがありません</div>
			</div>
		);
	}

	const headerLabel =
		notebookFilter === 'ALL'
			? '全メモ'
			: notebookFilter === 'INBOX'
				? '受信箱'
				: 'ノートブック内のメモ';

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="max-w-4xl mx-auto p-4">
				<div className="mb-4 flex items-baseline justify-between">
					<h1 className="text-xl font-semibold text-gray-900">{headerLabel}</h1>
					<span className="text-sm text-gray-500">{filteredMemos.length} 件</span>
				</div>
				<div className="space-y-2">
					{filteredMemos.map((memo) => (
						<MemoItem key={memo.id} memo={memo} onClick={() => goToEdit(memo)} />
					))}
				</div>
			</div>
		</div>
	);
};
