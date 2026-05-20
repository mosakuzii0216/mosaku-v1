import { useMemo, useState } from 'react';
import { useMemos, useSearchMemos } from '../../hooks/useMemoQueries';
import { Search } from 'lucide-react';
import { useViewStore } from '../../stores/useViewStore';
import { useNavigation } from '../../hooks/useNavigation';
import { MemoItem } from './MemoItem';

export const MemoList = () => {
	const { notebookFilter } = useViewStore();
	const { goToEdit } = useNavigation();

	const [query, setQuery] = useState('');
	const trimmedQuery = query.trim();
	const isSearching = trimmedQuery.length > 0;

	const memosQuery = useMemos();
	const searchQuery = useSearchMemos(trimmedQuery);

	const activeQuery = isSearching ? searchQuery : memosQuery;
	const { data: memos = [], isLoading, error } = activeQuery;

	type SortKey = 'updated_desc' | 'updated_asc' | 'created_desc' | 'title_asc';
	const [sortKey, setSortKey] = useState<SortKey>('updated_desc');

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

	const sortedMemos = useMemo(() => {
		const list = [...filteredMemos];
		switch (sortKey) {
			case 'updated_desc':
				return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			case 'updated_asc':
				return list.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
			case 'created_desc':
				return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			case 'title_asc':
				return list.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
		
	})

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
				<div className="text-gray-500">
					{isSearching ? '該当するメモが見つかりません' : 'メモがありません'}
				</div>
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
				<div className='mb-4 flex gap-2'>
					<div className="relative flex-1">
						<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="タイトル・本文で検索..."
							className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
					</div>
					<select
						value={sortKey}
						onChange={(e) => setSortKey(e.target.value as SortKey)}
						className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="updated_desc">更新日時(新しい順)</option>
						<option value="updated_asc">更新日時(古い順)</option>
						<option value="created_desc">作成日時(新しい順)</option>
						<option value="title_asc">タイトル昇順</option>
					</select>
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
