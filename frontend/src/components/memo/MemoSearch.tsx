import { useState, useEffect } from 'react';
import { useViewStore } from '../../stores/useViewStore';
import { useSearchMemos } from '../../hooks/useMemoQueries';

export const MemoSearch = () => {
	const { searchQuery, setSearchQuery } = useViewStore();
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
		<div className="p-4 border-b border-[var(--outline)]">
			<div className="relative">
				<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<svg
						className="h-5 w-5 text-[var(--on-surface-variant)]"
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
					className="shell-field block w-full pl-10 pr-3"
				/>
				{localQuery && (
					<button
						onClick={() => setLocalQuery('')}
						className="absolute inset-y-0 right-0 pr-3 flex items-center"
					>
						<svg
							className="h-5 w-5 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
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
