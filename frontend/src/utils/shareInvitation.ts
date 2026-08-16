export interface ShareInvitationInput {
	shareUrl: string;
	inviterName: string | null;
}

export type ShareInvitationResult =
	| { method: 'web-share'; cancelled?: boolean }
	| { method: 'clipboard' }
	| { method: 'failed'; error?: Error };

function buildShareData(input: ShareInvitationInput): ShareData {
	const inviterLabel = input.inviterName ?? 'あるユーザー';
	return {
		title: 'Mosaku への招待',
		text: `${inviterLabel}さんから Mosaku に招待されました`,
		url: input.shareUrl,
	};
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

async function copyToClipboard(shareUrl: string): Promise<ShareInvitationResult> {
	const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
	if (!clipboard || typeof clipboard.writeText !== 'function') {
		return { method: 'failed' };
	}
	try {
		await clipboard.writeText(shareUrl);
		return { method: 'clipboard' };
	} catch (error) {
		return {
			method: 'failed',
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

export async function shareInvitation(input: ShareInvitationInput): Promise<ShareInvitationResult> {
	if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
		const shareData = buildShareData(input);
		const canShare =
			typeof navigator.canShare === 'function' ? navigator.canShare(shareData) : true;
		if (canShare) {
			try {
				await navigator.share(shareData);
				return { method: 'web-share' };
			} catch (error) {
				if (isAbortError(error)) {
					return { method: 'web-share', cancelled: true };
				}
				return copyToClipboard(input.shareUrl);
			}
		}
	}

	return copyToClipboard(input.shareUrl);
}
