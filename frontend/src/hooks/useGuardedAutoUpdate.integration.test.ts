/**
 * Task 6.1 - 自動更新フローの統合テスト
 *
 * 実際の useSaveStatusStore / useEditorFocusStore を使い、
 * useSaveStatusStore + useGuardedAutoUpdate + useSwRegistration(mock) の
 * 連携が正しく成立することを検証する。
 *
 * Req 6.2 対象挙動:
 * - 新版 waiting → saving → 保存確定 → 自動リロード
 * - フォーカス中は保留 → blur で flush
 */
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./useSwRegistration');
vi.mock('@sentry/react', () => ({
	addBreadcrumb: vi.fn(),
}));

import { useSwRegistration } from './useSwRegistration';
import { useSaveStatusStore } from '../stores/useSaveStatusStore';
import { useEditorFocusStore } from '../stores/useEditorFocusStore';
import { useGuardedAutoUpdate } from './useGuardedAutoUpdate';

const useSwRegistrationMock = vi.mocked(useSwRegistration);

function makeApplyUpdate() {
	return vi.fn().mockResolvedValue(undefined);
}

function setupSwMock(opts: { updateAvailable: boolean; applyUpdate: ReturnType<typeof vi.fn> }) {
	useSwRegistrationMock.mockReturnValue({
		updateAvailable: opts.updateAvailable,
		applyUpdate: opts.applyUpdate,
	});
}

describe('useGuardedAutoUpdate — 統合テスト（実ストア連携）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// 実ストアをリセット
		useSaveStatusStore.setState({ statuses: {} });
		useEditorFocusStore.setState({ isEditorFocused: false });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('シナリオ 1: 新版 waiting → saving → 保存確定 → 自動リロード（Req 6.2）', () => {
		it('saving 中は applyUpdate を保留し、saved に変化した瞬間に 1 回だけ起動する', async () => {
			const applyUpdate = makeApplyUpdate();
			setupSwMock({ updateAvailable: true, applyUpdate });

			// エディタが saving 中（未保存作業あり）
			useSaveStatusStore.getState().setStatus('editor-1', 'saving');

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});

			// guard blocked: saving がある → applyUpdate 未呼出
			expect(applyUpdate).not.toHaveBeenCalled();

			// 保存確定 → saved に遷移（実ストアを直接操作）
			act(() => {
				useSaveStatusStore.getState().setStatus('editor-1', 'saved');
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			// guard pass: settled → applyUpdate が 1 回呼ばれる
			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('pending → saved の遷移でも自動リロードが発火する', async () => {
			const applyUpdate = makeApplyUpdate();
			setupSwMock({ updateAvailable: true, applyUpdate });

			useSaveStatusStore.getState().setStatus('editor-1', 'pending');

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			act(() => {
				useSaveStatusStore.getState().setStatus('editor-1', 'saved');
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('error 中は保留し、settled（idle）に変化したら発火する（Req 2.3）', async () => {
			const applyUpdate = makeApplyUpdate();
			setupSwMock({ updateAvailable: true, applyUpdate });

			useSaveStatusStore.getState().setStatus('editor-1', 'error');

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			act(() => {
				useSaveStatusStore.getState().setStatus('editor-1', 'idle');
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('複数エディタのうち 1 つが saving なら保留し、全員が settled になったら発火する', async () => {
			const applyUpdate = makeApplyUpdate();
			setupSwMock({ updateAvailable: true, applyUpdate });

			useSaveStatusStore.getState().setStatus('editor-1', 'saved');
			useSaveStatusStore.getState().setStatus('editor-2', 'saving');

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			// editor-2 も保存完了
			act(() => {
				useSaveStatusStore.getState().setStatus('editor-2', 'saved');
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});
	});

	describe('シナリオ 2: フォーカス中は保留 → blur で flush（Req 2.2, 2.4）', () => {
		it('エディタフォーカス中は applyUpdate を保留し、blur 後に 1 回だけ起動する', async () => {
			const applyUpdate = makeApplyUpdate();
			setupSwMock({ updateAvailable: true, applyUpdate });

			// エディタがフォーカス中（実ストアを直接操作）
			act(() => {
				useEditorFocusStore.getState().setEditorFocused(true);
			});

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			// blur（フォーカス解除）
			act(() => {
				useEditorFocusStore.getState().setEditorFocused(false);
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});

		it('フォーカス中かつ saving 中：フォーカスのみ解除してもまだ保留する', async () => {
			const applyUpdate = makeApplyUpdate();
			setupSwMock({ updateAvailable: true, applyUpdate });

			useSaveStatusStore.getState().setStatus('editor-1', 'saving');
			act(() => {
				useEditorFocusStore.getState().setEditorFocused(true);
			});

			const { rerender } = renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			// blur だけ → saving が残っているので保留継続
			act(() => {
				useEditorFocusStore.getState().setEditorFocused(false);
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).not.toHaveBeenCalled();

			// 保存確定 → 両方解消 → flush
			act(() => {
				useSaveStatusStore.getState().setStatus('editor-1', 'saved');
			});
			rerender();
			await act(async () => {
				await Promise.resolve();
			});
			expect(applyUpdate).toHaveBeenCalledTimes(1);
		});
	});

	describe('シナリオ 3: 更新なし時は一切リロードしない（Req 1.5）', () => {
		it('updateAvailable=false なら settled＋非フォーカスでも applyUpdate を呼ばない', async () => {
			const applyUpdate = makeApplyUpdate();
			setupSwMock({ updateAvailable: false, applyUpdate });

			useSaveStatusStore.getState().setStatus('editor-1', 'saved');

			renderHook(() => useGuardedAutoUpdate());
			await act(async () => {
				await Promise.resolve();
			});

			expect(applyUpdate).not.toHaveBeenCalled();
		});
	});
});
