import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import { useMemo as useMemoQuery } from '../../hooks/useMemoQueries';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import { PublicMemoRenderer } from '../public/PublicMemoRenderer';

export const FocusMemoOverlay: React.FC = () => {
	const isDisplayMode = useViewStore((s) => s.isDisplayMode);
	const closeDisplayMode = useViewStore((s) => s.closeDisplayMode);
	const selectedMemoId = useMemoDataStore((s) => s.selectedMemoId);
	const { data: memo } = useMemoQuery(selectedMemoId ?? '');
	const activeTheme = useActiveTheme();

	// selectedMemoId が null のとき即時閉じる
	useEffect(() => {
		if (isDisplayMode && !selectedMemoId) {
			closeDisplayMode();
		}
	}, [isDisplayMode, selectedMemoId, closeDisplayMode]);

	// スクロールロック
	useEffect(() => {
		if (!isDisplayMode) return;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = '';
		};
	}, [isDisplayMode]);

	// ESC キーで閉じる
	useEffect(() => {
		if (!isDisplayMode) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeDisplayMode();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [isDisplayMode, closeDisplayMode]);

	if (!isDisplayMode) return null;

	const renderContent = () => {
		if (!memo) {
			return (
				<p className="text-center text-gray-500 mt-8" data-testid="loading-message">
					読み込み中...
				</p>
			);
		}
		if (!memo.content) {
			return (
				<p className="text-center text-gray-400 mt-8" data-testid="empty-content-message">
					まだ内容がありません
				</p>
			);
		}
		return <PublicMemoRenderer content={memo.content} />;
	};

	const overlayProps: React.HTMLAttributes<HTMLDivElement> & {
		'data-testid'?: string;
		'data-theme-id'?: string;
	} = {
		'data-testid': 'focus-memo-overlay',
		className: 'fixed inset-0 z-[9999] flex flex-col overflow-y-auto',
		style: {
			backgroundColor: 'var(--color-background, #ffffff)',
			color: 'var(--color-text, #111827)',
		},
		onClick: closeDisplayMode,
	};
	if (activeTheme?.id) {
		overlayProps['data-theme-id'] = activeTheme.id;
	}

	return createPortal(
		<div {...overlayProps}>
			{/* 閉じるボタン */}
			<button
				className="fixed top-4 right-4 z-[10000] p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
				onClick={(e) => {
					e.stopPropagation();
					closeDisplayMode();
				}}
				aria-label="表示モードを閉じる"
				data-testid="close-button"
			>
				✕
			</button>

			{/* コンテンツエリア */}
			<div
				className="mx-auto w-full px-6 py-12"
				style={{
					maxWidth: '65ch',
					fontSize: 'var(--dm-font-size, 18px)',
					lineHeight: 'var(--dm-line-height, 1.8)',
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{memo && (
					<h1 className="text-2xl font-bold mb-8 select-text" data-testid="memo-title">
						{memo.title}
					</h1>
				)}
				{renderContent()}
			</div>
		</div>,
		document.body,
	);
};
