import { useState, useEffect, useRef } from 'react';
import {
	useMyPublicMemos,
	useUnpublishMemo,
	useRegenerateMemoToken,
} from '../../hooks/useMemoSharingQueries';
import { getAppUrl } from '../../utils/env';

type FeedbackTone = 'success' | 'error';

interface Feedback {
	tone: FeedbackTone;
	message: string;
}

const TONE_CLASSES: Record<FeedbackTone, string> = {
	success: 'bg-green-50 border-green-300 text-green-800',
	error: 'bg-red-50 border-red-300 text-red-800',
};

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString('ja-JP');
}

export function PublicMemosCard() {
	const { data: memos, isLoading } = useMyPublicMemos();
	const unpublishMemo = useUnpublishMemo();
	const regenerateToken = useRegenerateMemoToken();

	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

	const handleCopyUrl = async (token: string) => {
		const url = `${getAppUrl()}/p/${token}`;
		try {
			await navigator.clipboard.writeText(url);
			showFeedback('success', 'URLをコピーしました');
		} catch {
			showFeedback('error', 'URLのコピーに失敗しました');
		}
	};

	const handleUnpublish = async (memoId: string) => {
		try {
			await unpublishMemo.mutateAsync(memoId);
			showFeedback('success', '公開を解除しました');
		} catch {
			showFeedback('error', '公開解除に失敗しました');
		}
	};

	const handleRegenerate = async (memoId: string, oldToken: string) => {
		try {
			await regenerateToken.mutateAsync({ memoId, oldToken });
			showFeedback('success', 'URLを再生成しました');
		} catch {
			showFeedback('error', 'URL再生成に失敗しました');
		}
	};

	return (
		<section
			data-testid="public-memos-card"
			className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 space-y-4"
		>
			<header>
				<h2 className="text-base font-semibold text-gray-800">公開中のメモ</h2>
				<p className="text-sm text-gray-500">現在公開中のメモを一覧で確認・管理できます</p>
			</header>

			{feedback && (
				<div
					role="status"
					className={`border rounded-lg px-3 py-2 text-sm ${TONE_CLASSES[feedback.tone]}`}
				>
					{feedback.message}
				</div>
			)}

			{isLoading ? (
				<p className="text-sm text-gray-500">読み込み中...</p>
			) : !memos || memos.length === 0 ? (
				<div data-testid="public-memos-empty" className="text-center py-6 space-y-2">
					<p className="text-sm text-gray-700 font-medium">現在公開中のメモはありません</p>
					<p className="text-sm text-gray-500">メモ編集画面から「公開する」ボタンで公開できます</p>
				</div>
			) : (
				<ul className="space-y-3">
					{memos.map((memo) => (
						<li
							key={memo.memoId}
							className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="space-y-1 min-w-0">
								<p className="text-sm font-medium text-gray-800 truncate">{memo.title}</p>
								<p className="text-xs text-gray-500">公開日: {formatDate(memo.publishedAt)}</p>
							</div>
							<div className="flex gap-2 flex-shrink-0">
								<button
									type="button"
									onClick={() => handleCopyUrl(memo.publicToken)}
									className="min-h-[36px] px-3 py-1 text-sm text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
								>
									URLをコピー
								</button>
								<button
									type="button"
									onClick={() => handleRegenerate(memo.memoId, memo.publicToken)}
									disabled={regenerateToken.isPending}
									className="min-h-[36px] px-3 py-1 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
								>
									再生成
								</button>
								<button
									type="button"
									onClick={() => handleUnpublish(memo.memoId)}
									disabled={unpublishMemo.isPending}
									className="min-h-[36px] px-3 py-1 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
								>
									公開解除
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
