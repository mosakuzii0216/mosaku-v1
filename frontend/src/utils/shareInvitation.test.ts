import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareInvitation } from './shareInvitation';

const SHARE_URL = 'https://mosaku.jp/invite/abc123';

describe('shareInvitation', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	describe('Web Share API が使える環境', () => {
		beforeEach(() => {
			Object.defineProperty(window, 'isSecureContext', {
				value: true,
				configurable: true,
				writable: true,
			});
		});

		it('navigator.share が成功した場合は { method: "web-share" } を返す', async () => {
			const shareMock = vi.fn().mockResolvedValue(undefined);
			const canShareMock = vi.fn().mockReturnValue(true);
			vi.stubGlobal('navigator', {
				...navigator,
				share: shareMock,
				canShare: canShareMock,
			});

			const result = await shareInvitation({ shareUrl: SHARE_URL, inviterName: 'モサ子' });

			expect(result).toEqual({ method: 'web-share' });
			expect(shareMock).toHaveBeenCalledTimes(1);
			const arg = shareMock.mock.calls[0][0];
			expect(arg.url).toBe(SHARE_URL);
		});

		it('navigator.share の AbortError はキャンセル扱いで { method: "web-share", cancelled: true } を返す', async () => {
			const abortError = new DOMException('User cancelled', 'AbortError');
			const shareMock = vi.fn().mockRejectedValue(abortError);
			const canShareMock = vi.fn().mockReturnValue(true);
			vi.stubGlobal('navigator', {
				...navigator,
				share: shareMock,
				canShare: canShareMock,
			});

			const result = await shareInvitation({ shareUrl: SHARE_URL, inviterName: null });

			expect(result).toEqual({ method: 'web-share', cancelled: true });
		});

		it('navigator.share の AbortError 以外のエラーは clipboard へフォールバックする', async () => {
			const otherError = new Error('something went wrong');
			const shareMock = vi.fn().mockRejectedValue(otherError);
			const canShareMock = vi.fn().mockReturnValue(true);
			const writeTextMock = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('navigator', {
				...navigator,
				share: shareMock,
				canShare: canShareMock,
				clipboard: { writeText: writeTextMock },
			});

			const result = await shareInvitation({ shareUrl: SHARE_URL, inviterName: null });

			expect(result).toEqual({ method: 'clipboard' });
			expect(writeTextMock).toHaveBeenCalledWith(SHARE_URL);
		});
	});

	describe('Web Share API が使えない環境', () => {
		beforeEach(() => {
			Object.defineProperty(window, 'isSecureContext', {
				value: true,
				configurable: true,
				writable: true,
			});
		});

		it('navigator.share が未定義なら clipboard にフォールバックする', async () => {
			const writeTextMock = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('navigator', {
				...navigator,
				share: undefined,
				canShare: undefined,
				clipboard: { writeText: writeTextMock },
			});

			const result = await shareInvitation({ shareUrl: SHARE_URL, inviterName: null });

			expect(result).toEqual({ method: 'clipboard' });
			expect(writeTextMock).toHaveBeenCalledWith(SHARE_URL);
		});

		it('clipboard.writeText が失敗した場合は { method: "failed", error } を返す', async () => {
			const writeError = new Error('clipboard denied');
			const writeTextMock = vi.fn().mockRejectedValue(writeError);
			vi.stubGlobal('navigator', {
				...navigator,
				share: undefined,
				canShare: undefined,
				clipboard: { writeText: writeTextMock },
			});

			const result = await shareInvitation({ shareUrl: SHARE_URL, inviterName: null });

			expect(result.method).toBe('failed');
			if (result.method === 'failed') {
				expect(result.error).toBe(writeError);
			}
		});

		it('clipboard API が利用できない場合は { method: "failed" } を返す', async () => {
			vi.stubGlobal('navigator', {
				...navigator,
				share: undefined,
				canShare: undefined,
				clipboard: undefined,
			});

			const result = await shareInvitation({ shareUrl: SHARE_URL, inviterName: null });

			expect(result.method).toBe('failed');
		});
	});
});
