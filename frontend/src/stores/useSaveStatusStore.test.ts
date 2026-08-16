import { describe, it, expect, beforeEach } from 'vitest';
import {
	useSaveStatusStore,
	RELOAD_BLOCKING_STATUSES,
	selectHasUnsavedWork,
} from './useSaveStatusStore';

describe('useSaveStatusStore', () => {
	beforeEach(() => {
		useSaveStatusStore.setState({ statuses: {} });
	});

	describe('setStatus / clearStatus', () => {
		it('setStatus で id 単位でステータスを登録できる', () => {
			useSaveStatusStore.getState().setStatus('id1', 'saving');
			expect(useSaveStatusStore.getState().statuses['id1']).toBe('saving');
		});

		it('setStatus は同一 id を上書きする', () => {
			useSaveStatusStore.getState().setStatus('id1', 'pending');
			useSaveStatusStore.getState().setStatus('id1', 'saved');
			expect(useSaveStatusStore.getState().statuses['id1']).toBe('saved');
		});

		it('clearStatus でエントリが削除される', () => {
			useSaveStatusStore.getState().setStatus('id1', 'saving');
			useSaveStatusStore.getState().clearStatus('id1');
			expect(useSaveStatusStore.getState().statuses['id1']).toBeUndefined();
		});

		it('複数 id を独立して管理できる', () => {
			useSaveStatusStore.getState().setStatus('id1', 'saving');
			useSaveStatusStore.getState().setStatus('id2', 'saved');
			expect(useSaveStatusStore.getState().statuses['id1']).toBe('saving');
			expect(useSaveStatusStore.getState().statuses['id2']).toBe('saved');
		});

		it('片方を clearStatus しても他方は残る', () => {
			useSaveStatusStore.getState().setStatus('id1', 'saving');
			useSaveStatusStore.getState().setStatus('id2', 'saved');
			useSaveStatusStore.getState().clearStatus('id1');
			expect(useSaveStatusStore.getState().statuses['id1']).toBeUndefined();
			expect(useSaveStatusStore.getState().statuses['id2']).toBe('saved');
		});

		it('存在しない id を clearStatus しても例外を投げない', () => {
			expect(() => useSaveStatusStore.getState().clearStatus('nonexistent')).not.toThrow();
		});
	});

	describe('RELOAD_BLOCKING_STATUSES', () => {
		it('pending は blocking', () => {
			expect(RELOAD_BLOCKING_STATUSES.has('pending')).toBe(true);
		});

		it('saving は blocking', () => {
			expect(RELOAD_BLOCKING_STATUSES.has('saving')).toBe(true);
		});

		it('error は blocking', () => {
			expect(RELOAD_BLOCKING_STATUSES.has('error')).toBe(true);
		});

		it('idle は settled（non-blocking）', () => {
			expect(RELOAD_BLOCKING_STATUSES.has('idle')).toBe(false);
		});

		it('saved は settled（non-blocking）', () => {
			expect(RELOAD_BLOCKING_STATUSES.has('saved')).toBe(false);
		});

		it('offline-saved は settled（non-blocking）', () => {
			expect(RELOAD_BLOCKING_STATUSES.has('offline-saved')).toBe(false);
		});
	});

	describe('selectHasUnsavedWork', () => {
		it('statuses が空のとき false', () => {
			expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(false);
		});

		it.each(['pending', 'saving', 'error'] as const)(
			'blocking ステータス %s があるとき true',
			(status) => {
				useSaveStatusStore.getState().setStatus('id1', status);
				expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(true);
			},
		);

		it.each(['idle', 'saved', 'offline-saved'] as const)(
			'settled ステータス %s のみのとき false',
			(status) => {
				useSaveStatusStore.getState().setStatus('id1', status);
				expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(false);
			},
		);

		it('複数 id のうち 1 つが blocking なら true', () => {
			useSaveStatusStore.getState().setStatus('id1', 'saved');
			useSaveStatusStore.getState().setStatus('id2', 'pending');
			expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(true);
		});

		it('全 id が settled なら false', () => {
			useSaveStatusStore.getState().setStatus('id1', 'saved');
			useSaveStatusStore.getState().setStatus('id2', 'idle');
			useSaveStatusStore.getState().setStatus('id3', 'offline-saved');
			expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(false);
		});

		it('clearStatus 後に blocking が消えたら false に戻る', () => {
			useSaveStatusStore.getState().setStatus('id1', 'saving');
			expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(true);
			useSaveStatusStore.getState().clearStatus('id1');
			expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(false);
		});

		it('blocking id と settled id が混在するとき、blocking 削除後に false になる', () => {
			useSaveStatusStore.getState().setStatus('id1', 'error');
			useSaveStatusStore.getState().setStatus('id2', 'saved');
			expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(true);
			useSaveStatusStore.getState().clearStatus('id1');
			expect(selectHasUnsavedWork(useSaveStatusStore.getState())).toBe(false);
		});
	});
});
