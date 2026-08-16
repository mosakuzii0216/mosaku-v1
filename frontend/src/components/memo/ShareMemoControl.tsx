import { useState, useEffect, useRef } from 'react';
import {
	usePublishMemo,
	useUnpublishMemo,
	useRegenerateMemoToken,
} from '../../hooks/useMemoSharingQueries';
import { getAppUrl } from '../../utils/env';
import type { Memo } from '../../types/memo';

type FeedbackTone = 'success' | 'error';

interface Feedback {
	tone: FeedbackTone;
	message: string;
}

interface ShareMemoControlProps {
	memo: Memo;
}

export const ShareMemoControl = ({ memo }: ShareMemoControlProps) => {
	const [menuOpen, setMenuOpen] = useState(false);
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const publishMemo = usePublishMemo();
	const unpublishMemo = useUnpublishMemo();
	const regenerateToken = useRegenerateMemoToken();

	const isPublished = !!memo.publicToken;
	const isTrashed = !!memo.trashedAt;
	const isPending = publishMemo.isPending || unpublishMemo.isPending || regenerateToken.isPending;

	const publicUrl = memo.publicToken ? `${getAppUrl()}/p/${memo.publicToken}` : '';

	useEffect(() => {
		return () => {
			if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
		};
	}, []);

	const showFeedback = (tone: FeedbackTone, message: string) => {
		if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
		setFeedback({ tone, message });
		feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3000);
	};

	const handlePublish = async () => {
		try {
			await publishMemo.mutateAsync(memo.id);
			showFeedback('success', 'メモを公開しました');
		} catch {
			showFeedback('error', '公開に失敗しました');
		}
	};

	const handleUnpublish = async () => {
		setMenuOpen(false);
		try {
			await unpublishMemo.mutateAsync(memo.id);
			showFeedback('success', '公開を解除しました');
		} catch {
			showFeedback('error', '公開解除に失敗しました');
		}
	};

	const handleRegenerate = async () => {
		setMenuOpen(false);
		if (!memo.publicToken) return;
		try {
			await regenerateToken.mutateAsync({ memoId: memo.id, oldToken: memo.publicToken });
			showFeedback('success', 'URLを再生成しました');
		} catch {
			showFeedback('error', 'URL再生成に失敗しました');
		}
	};

	const handleCopyUrl = async () => {
		setMenuOpen(false);
		try {
			await navigator.clipboard.writeText(publicUrl);
			showFeedback('success', 'URLをコピーしました');
		} catch {
			showFeedback('error', 'URLのコピーに失敗しました');
		}
	};

	return (
		<div className="relative flex items-center gap-2">
			{!isPublished ? (
				<button
					type="button"
					onClick={handlePublish}
					disabled={isTrashed || isPending}
					className="shell-button-primary px-3 py-1 text-sm"
				>
					{publishMemo.isPending ? '公開中...' : '公開する'}
				</button>
			) : (
				<div className="flex items-center gap-2">
					<span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-[var(--success-container)] text-[var(--on-success-container)]">
						公開中
					</span>
					<button
						type="button"
						aria-label="共有メニューを開く"
						onClick={() => setMenuOpen((prev) => !prev)}
						disabled={isTrashed || isPending}
						className="shell-button px-3 py-1 text-sm border-[var(--success)]"
					>
						共有
					</button>
				</div>
			)}

			{menuOpen && (
				<div
					role="menu"
					className="shell-popover absolute right-0 top-full mt-1 z-50 py-1 min-w-[160px]"
				>
					<button
						role="menuitem"
						type="button"
						onClick={handleCopyUrl}
						className="shell-popover-item w-full text-left px-4 py-2 text-sm"
					>
						URLをコピー
					</button>
					<button
						role="menuitem"
						type="button"
						onClick={handleRegenerate}
						className="shell-popover-item w-full text-left px-4 py-2 text-sm"
					>
						トークン再生成
					</button>
					<button
						role="menuitem"
						type="button"
						onClick={handleUnpublish}
						className="w-full text-left px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-container)]"
					>
						公開解除
					</button>
				</div>
			)}

			{feedback && (
				<div
					role="status"
					className={`absolute right-0 top-full mt-10 z-50 px-3 py-2 text-sm rounded-lg shadow-md border ${
						feedback.tone === 'success'
							? 'bg-[var(--success-container)] border-[var(--success)] text-[var(--on-success-container)]'
							: 'bg-[var(--danger-container)] border-[var(--danger)] text-[var(--on-danger-container)]'
					}`}
				>
					{feedback.message}
				</div>
			)}
		</div>
	);
};
