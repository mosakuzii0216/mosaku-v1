import { BookOpen, ChevronRight } from 'lucide-react';
import { useHomeDashboardNotebooks } from '../../hooks/useHomeDashboardQueries';
import { useNavigation } from '../../hooks/useNavigation';

export const HomeNotebookSection = () => {
	const { data: notebooks, isLoading, isError, refetch } = useHomeDashboardNotebooks();
	const { goToMemosForNotebook, goToNotebookCreate } = useNavigation();

	return (
		<div className="px-4 py-3">
			<h2 className="text-sm font-semibold text-[var(--on-surface-variant)] mb-2">ノートブック</h2>
			{isLoading && (
				<div data-testid="notebooks-skeleton" className="space-y-2">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-10 bg-[var(--surface-variant)] rounded-lg animate-pulse" />
					))}
				</div>
			)}
			{isError && (
				<div className="text-sm text-[var(--on-surface-variant)]">
					<p>データを取得できませんでした</p>
					<button onClick={() => refetch()} className="mt-1 text-[var(--accent)] text-sm">
						再試行
					</button>
				</div>
			)}
			{!isLoading && !isError && notebooks?.length === 0 && (
				<div className="text-sm text-[var(--on-surface-variant)]">
					<p>ノートブックがありません</p>
					<button onClick={goToNotebookCreate} className="mt-1 text-[var(--accent)]">
						ノートブックを作成する
					</button>
				</div>
			)}
			{!isLoading && !isError && notebooks && notebooks.length > 0 && (
				<div className="space-y-1">
					{notebooks.map((nb) => (
						<button
							key={nb.id}
							onClick={() => goToMemosForNotebook(nb.id)}
							className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--state-hover)] transition-colors text-left"
						>
							<BookOpen className="w-4 h-4 text-[var(--on-surface-variant)] flex-shrink-0" />
							<span className="flex-1 text-sm font-medium text-[var(--on-surface)] truncate">
								{nb.name ?? '無名ノートブック'}
							</span>
							<span className="text-xs text-[var(--on-surface-variant)]">{nb.memoCount}</span>
							<ChevronRight className="w-4 h-4 text-[var(--on-surface-variant)] flex-shrink-0" />
						</button>
					))}
				</div>
			)}
		</div>
	);
};
