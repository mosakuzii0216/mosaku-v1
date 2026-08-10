import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import { useMemo as useMemoQuery } from '../../hooks/useMemoQueries';
import { useActiveTheme } from '../../hooks/useActiveTheme';
import { isEmptyDoc } from '../../utils/editor/prosemirrorText';
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
				<p className="text-center mt-8 opacity-70" data-testid="loading-message">
					読み込み中...
				</p>
			);
		}
		// content は JSONContent（オブジェクト）。空メモも `{type:'doc',content:[{type:'paragraph'}]}`
		// という truthy な値で来るため、真偽値ではなく本文テキストの有無で判定する（Req 3.4）。
		if (isEmptyDoc(memo.content)) {
			return (
				<p className="text-center mt-8 opacity-60" data-testid="empty-content-message">
					まだ内容がありません
				</p>
			);
		}
		return (
			<div className="display-mode-content">
				<PublicMemoRenderer content={memo.content} />
			</div>
		);
	};

	const overlayProps: React.HTMLAttributes<HTMLDivElement> & {
		'data-testid'?: string;
		'data-theme-id'?: string;
	} = {
		'data-testid': 'focus-memo-overlay',
		className: 'fixed inset-0 z-[9999] flex flex-col overflow-y-auto',
		// テーマ CSS（useThemeCSS が `.theme-root` → `[data-theme-id="<id>"]` へ書き換えて注入）が
		// 実際に定義しているのは --theme-* 系。--color-background / --color-text はこのリポジトリの
		// どこにも定義がなく、常にフォールバック（白背景・黒文字）に落ちていた（Req 5.1）。
		// --theme-bg はテーマによってグラデーション値なので background ショートハンドで受ける。
		// フォールバックは Layer①（tokens.css が <html> へ敷く shell トークン）→ 中立既定の順。
		// --app-shell-bg は mori で transparent なので地色には使わない（背後のアプリが透ける）。
		style: {
			background: 'var(--theme-bg, var(--shell-base-bg, #ffffff))',
			color: 'var(--theme-text-color, var(--on-surface, #111827))',
			fontFamily: 'var(--theme-font-family, inherit)',
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
				// 暗いテーマ（yoru/umi/mori）でも視認できるよう、固定の gray ではなく
				// テーマ文字色（currentColor）へ追随させる。
				className="fixed top-4 right-4 z-[10000] p-2 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 transition-opacity"
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
