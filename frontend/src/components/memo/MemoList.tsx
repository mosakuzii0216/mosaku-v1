import { useState } from 'react';
import { List, LayoutList } from 'lucide-react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useMemos } from '../../hooks/useMemoQueries';
import { useNotebooks } from '../../hooks/useNotebookQueries';
import { MemoItem } from './MemoItem';
import type { Memo } from '../../types/memo';
// import { MemoSearch } from './MemoSearch';

type DateGroup = '今日' | '昨日' | '今週' | '今月' | 'それ以前';
export type ViewDensity = 'compact' | 'normal';

const getDateGroup = (dateString: string): DateGroup => {
	const date = new Date(dateString);
	const now = new Date();
	const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
	const diffInDays = diffInHours / 24;

	// 今日の開始時刻（0時）を取得
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterdayStart = new Date(todayStart);
	yesterdayStart.setDate(yesterdayStart.getDate() - 1);

	if (date >= todayStart) {
		return '今日';
	} else if (date >= yesterdayStart) {
		return '昨日';
	} else if (diffInDays <= 7) {
		return '今週';
	} else if (diffInDays <= 30) {
		return '今月';
	} else {
		return 'それ以前';
	}
};

const groupMemosByDate = (memos: Memo[]): Record<DateGroup, Memo[]> => {
	const groups: Record<DateGroup, Memo[]> = {
		今日: [],
		昨日: [],
		今週: [],
		今月: [],
		'それ以前': [],
	};

	memos.forEach((memo) => {
		const group = getDateGroup(memo.updatedAt);
		groups[group].push(memo);
	});

	return groups;
};

export const MemoList = () => {
	const { memos, notebookFilter, setNotebookFilter } = useMemoStore();
	const { isLoading, error } = useMemos();
	const { data: notebooks = [] } = useNotebooks();
	const [viewDensity, setViewDensity] = useState<ViewDensity>('normal');

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

	// Notebookフィルタに応じて表示を切り替え
	const filteredMemos = (() => {
		if (notebookFilter === 'ALL') return memos;
		if (notebookFilter === 'INBOX') return memos.filter((m) => !m.notebookId);
		return memos.filter((m) => m.notebookId === notebookFilter);
	})();

	// 日付でグループ化
	const groupedMemos = groupMemosByDate(filteredMemos);
	const dateGroups: DateGroup[] = ['今日', '昨日', '今週', '今月', 'それ以前'];

	return (
		<div className="flex flex-col h-full">
			{/* 表示密度切り替えバー */}
			<div className="px-4 py-2 border-b border-gray-200 flex items-center justify-end bg-white">
				<div className="flex gap-2">
					{/* コンパクト表示アイコン */}
					<button
						onClick={() => setViewDensity('compact')}
						className={`p-2 rounded transition-colors group relative ${
							viewDensity === 'compact'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'
						}`}
						title="コンパクト表示"
					>
						<List size={20} strokeWidth={2} />
						<span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
							コンパクト表示
						</span>
					</button>

					{/* 通常表示アイコン */}
					<button
						onClick={() => setViewDensity('normal')}
						className={`p-2 rounded transition-colors group relative ${
							viewDensity === 'normal'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'
						}`}
						title="通常表示"
					>
						<LayoutList size={20} strokeWidth={2} />
						<span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
							通常表示
						</span>
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				{notebookFilter !== 'ALL' && (
					<div className="px-4 py-2 text-sm bg-yellow-50/30 text-yellow-800 border-b border-yellow-100 flex items-center justify-between">
						<span>
							{(() => {
								if (notebookFilter === 'INBOX') {
									return 'フィルタ中: ノートブック未選択';
								}
								const notebook = notebooks.find((n) => n.id === notebookFilter);
								const notebook_name = notebook?.name ?? '無題のノートブック';
								return `フィルタ中: ${notebook_name}`;
							})()}
						</span>
						<button
							className="px-2 py-1 border rounded text-xs"
							onClick={() => setNotebookFilter('ALL')}
						>
							フィルタ解除
						</button>
					</div>
				)}
				<div>
					{dateGroups.map((group) => {
						const memosInGroup = groupedMemos[group];
						if (memosInGroup.length === 0) return null;

						return (
							<section key={group}>
								<div className="sticky top-0 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 z-10">
									{group} ({memosInGroup.length})
								</div>
								<div>
									{memosInGroup.map((memo) => (
										<MemoItem key={memo.id} memo={memo} density={viewDensity} />
									))}
								</div>
							</section>
						);
					})}
				</div>
			</div>
		</div>
	);
};
