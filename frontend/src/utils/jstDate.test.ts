import { describe, it, expect } from 'vitest';
import { JST_OFFSET_MS, toJSTDateString } from './jstDate';

describe('toJSTDateString', () => {
	it('UTC の日時を JST に換算した日付文字列を返す', () => {
		expect(toJSTDateString(new Date('2026-08-08T00:00:00.000Z'))).toBe('2026-08-08');
	});

	it('JST で日付が翌日に繰り上がる時刻を正しく扱う', () => {
		expect(toJSTDateString(new Date('2026-08-08T15:00:00.000Z'))).toBe('2026-08-09');
	});

	it('JST_OFFSET_MS は UTC+9 に相当する', () => {
		expect(JST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
	});
});
