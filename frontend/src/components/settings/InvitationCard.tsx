import { useState } from 'react';

import {
	useCreateMyInvitation,
	useDeleteMyInvitation,
	useMyInvitationQuota,
	useMyInvitations,
} from '../../hooks/useInvitationsQueries';
import { shareInvitation } from '../../utils/shareInvitation';
import { resolveInvitationErrorMessage } from '../../constants/invitationErrorMessages';
import { isApiError } from '../../utils/apiError';
import { formatDateTimeJa } from '../../utils/formatDate';
import type { InvitationWithShareUrlResponse } from '../../types/invitation';

type FeedbackTone = 'success' | 'info' | 'error';

interface Feedback {
	tone: FeedbackTone;
	message: string;
}

const TONE_CLASSES: Record<FeedbackTone, string> = {
	success: 'bg-green-50 border-green-300 text-green-800',
	info: 'bg-blue-50 border-blue-300 text-blue-800',
	error: 'bg-red-50 border-red-300 text-red-800',
};

export function InvitationCard() {
	const quotaQuery = useMyInvitationQuota();
	const listQuery = useMyInvitations();
	const createMutation = useCreateMyInvitation();
	const deleteMutation = useDeleteMyInvitation();
	const [feedback, setFeedback] = useState<Feedback | null>(null);

	const quota = quotaQuery.data;
	const isAdmin = quota?.role === 'ADMIN' || quota?.unlimited === true;
	const remaining = quota?.invitationQuota ?? 0;
	const issueDisabled = !!quota && !isAdmin && remaining <= 0;
	const issueTitle = issueDisabled ? '招待枠を使い切りました' : undefined;

	const handleCreate = async () => {
		setFeedback(null);
		try {
			const created = await createMutation.mutateAsync();
			setFeedback({
				tone: 'success',
				message: `招待リンクを発行しました: ${created.code}`,
			});
		} catch (error) {
			const code = isApiError(error) ? error.code : null;
			setFeedback({ tone: 'error', message: resolveInvitationErrorMessage(code) });
		}
	};

	const handleShare = async (invitation: InvitationWithShareUrlResponse) => {
		const result = await shareInvitation({
			shareUrl: invitation.shareUrl,
			inviterName: null,
		});
		if (result.method === 'web-share' && result.cancelled) {
			return;
		}
		if (result.method === 'web-share') {
			setFeedback({ tone: 'success', message: '招待リンクを共有しました' });
			return;
		}
		if (result.method === 'clipboard') {
			setFeedback({ tone: 'success', message: '招待リンクをコピーしました' });
			return;
		}
		setFeedback({
			tone: 'error',
			message: '共有に失敗しました。ブラウザの権限を確認してください',
		});
	};

	const handleDelete = async (invitation: InvitationWithShareUrlResponse) => {
		if (!window.confirm('この招待コードを削除しますか？')) {
			return;
		}
		setFeedback(null);
		try {
			await deleteMutation.mutateAsync({ id: invitation.id });
			setFeedback({ tone: 'success', message: '招待コードを削除しました' });
		} catch (error) {
			const code = isApiError(error) ? error.code : null;
			setFeedback({ tone: 'error', message: resolveInvitationErrorMessage(code) });
		}
	};

	const invitations = listQuery.data ?? [];

	return (
		<section
			data-testid="invitation-card"
			className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 space-y-4"
		>
			<header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="text-base font-semibold text-gray-800">友達を招待</h2>
					<p className="text-sm text-gray-500">
						招待リンクを共有して、知り合いを Mosaku に招待できます
					</p>
				</div>
				<span
					data-testid="invitation-quota-badge"
					className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto"
				>
					{!quota ? '...' : isAdmin ? '無制限' : `残り ${remaining} / 5`}
				</span>
			</header>

			<button
				type="button"
				onClick={handleCreate}
				disabled={issueDisabled || createMutation.isPending}
				title={issueTitle}
				className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
			>
				{createMutation.isPending ? '発行中...' : '招待リンクを発行'}
			</button>

			{feedback && (
				<div
					data-testid="invitation-feedback"
					role="status"
					className={`border rounded-lg px-3 py-2 text-sm ${TONE_CLASSES[feedback.tone]}`}
				>
					{feedback.message}
				</div>
			)}

			<div>
				<h3 className="text-sm font-semibold text-gray-700 mb-2">発行済みの招待リンク</h3>
				{listQuery.isLoading ? (
					<p className="text-sm text-gray-500">読み込み中...</p>
				) : invitations.length === 0 ? (
					<p className="text-sm text-gray-500">まだ発行されていません</p>
				) : (
					<ul className="space-y-2">
						{invitations.map((invitation) => (
							<li
								key={invitation.id}
								className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="space-y-1 min-w-0">
									<code className="block text-sm font-mono text-gray-800 truncate">
										{invitation.code}
									</code>
									<div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
										<span>
											{invitation.usedCount}/{invitation.maxUses}
										</span>
										<span>{formatDateTimeJa(invitation.createdAt)}</span>
									</div>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => handleShare(invitation)}
										className="min-h-[44px] px-3 py-2 text-sm font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
									>
										共有
									</button>
									<button
										type="button"
										onClick={() => handleDelete(invitation)}
										disabled={deleteMutation.isPending}
										className="min-h-[44px] px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
									>
										削除
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
