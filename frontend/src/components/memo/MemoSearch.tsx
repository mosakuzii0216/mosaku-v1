import { useState, useEffect } from 'react';
import { useMemoStore } from '../../stores/useMemoStore';
import { useSearchMemos } from '../../hooks/useMemoQueries';

export const MemoSearch = () => {
	const { searchQuery, setSearchQuery } = useMemoStore();
	const [localQuery, setLocalQuery] = useState(searchQuery);

	// デバウンス処理
	useEffect(() => {
		const timer = setTimeout(() => {
			setSearchQuery(localQuery);
		}, 300);

		return () => clearTimeout(timer);
	}, [localQuery, setSearchQuery]);

	// 検索実行
	useSearchMemos(searchQuery);

	return (
		<div className="p-4 border-b border-gray-200">
			<div className="relative">
				<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<svg
						className="h-5 w-5 text-gray-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</div>
				<input
					type="text"
					placeholder="検索"
					value={localQuery}
					onChange={(e) => setLocalQuery(e.target.value)}
					className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
				/>
				{localQuery && (
					<button
						onClick={() => setLocalQuery('')}
						className="absolute inset-y-0 right-0 pr-3 flex items-center"
					>
						<svg
							className="h-5 w-5 text-gray-400 hover:text-gray-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				)}
			</div>
		</div>
	);
};
