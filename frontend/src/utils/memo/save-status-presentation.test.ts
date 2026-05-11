import { describe, it, expect } from 'vitest';

import {
	describeDeleteConfirm,
	describeSaveStatus,
	exhaustiveSaveStatusKeys,
} from './save-status-presentation';
import type { SaveStatus } from '../../hooks/useAutoSave';

describe('describeSaveStatus', () => {
	it('全 6 状態 (idle / pending / saving / saved / error / offline-saved) を網羅的に分岐する', () => {
		const all: SaveStatus[] = ['idle', 'pending', 'saving', 'saved', 'error', 'offline-saved'];
		expect(exhaustiveSaveStatusKeys).toEqual(expect.arrayContaining(all));
		expect(exhaustiveSaveStatusKeys).toHaveLength(all.length);
		for (const status of all) {
			const result = describeSaveStatus(status);
			expect(result.tone).toBeDefined();
		}
	});

	it('idle はラベルを返さない（非表示）', () => {
		expect(describeSaveStatus('idle').label).toBe(null);
	});

	it('pending は「未保存」ラベルを返す', () => {
		expect(describeSaveStatus('pending').label).toBe('未保存');
		expect(describeSaveStatus('pending').tone).toBe('idle');
	});

	it('saving は「保存中...」ラベルと progress トーンを返す', () => {
		const desc = describeSaveStatus('saving');
		expect(desc.label).toBe('保存中...');
		expect(desc.tone).toBe('progress');
	});

	it('saved は「保存済み」ラベルと success トーンを返す', () => {
		const desc = describeSaveStatus('saved');
		expect(desc.label).toBe('保存済み');
		expect(desc.tone).toBe('success');
	});

	it('offline-saved は「再接続後に同期されます」を含むラベルと warn トーンを返す', () => {
		const desc = describeSaveStatus('offline-saved');
		expect(desc.label).toContain('オフライン保存済み');
		expect(desc.label).toContain('再接続後に同期されます');
		expect(desc.tone).toBe('warn');
	});

	it('error は error トーンで手動保存を促すラベルを返す', () => {
		const desc = describeSaveStatus('error');
		expect(desc.label).toContain('保存失敗');
		expect(desc.tone).toBe('error');
	});
});

describe('describeDeleteConfirm', () => {
	it('オンライン時は通常の削除確認文言を返す', () => {
		const msg = describeDeleteConfirm({ kind: 'trash', networkStatus: 'online' });
		expect(msg).toContain('ゴミ箱に移動');
		expect(msg).not.toContain('再接続後');
	});

	it('オフライン時のゴミ箱送りは「再接続後に同期されます」を含む', () => {
		const msg = describeDeleteConfirm({ kind: 'trash', networkStatus: 'offline' });
		expect(msg).toContain('再接続後に同期されます');
	});

	it('通信不安定時もオフラインと同様に再接続後の同期を案内する', () => {
		const msg = describeDeleteConfirm({ kind: 'trash', networkStatus: 'unstable' });
		expect(msg).toContain('再接続後に同期されます');
	});

	it('オンラインの完全削除は取り消せない旨を案内する', () => {
		const msg = describeDeleteConfirm({ kind: 'permanentDelete', networkStatus: 'online' });
		expect(msg).toContain('取り消せません');
	});

	it('オフラインの完全削除は再接続後に削除される旨を案内する', () => {
		const msg = describeDeleteConfirm({ kind: 'permanentDelete', networkStatus: 'offline' });
		expect(msg).toContain('再接続後に同期されます');
	});
});
