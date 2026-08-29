import { describe, it, expect } from 'vitest';

import { formatDateJa, formatDateTimeJa } from './formatDate';

describe('formatDateJa', () => {
	const iso = '2026-08-29T10:30:00.000Z';

	it('ja-JP ロケールの日付表示を返す', () => {
		expect(formatDateJa(iso)).toBe(new Date(iso).toLocaleDateString('ja-JP'));
	});

	it('時刻を含まない', () => {
		expect(formatDateJa(iso)).not.toMatch(/:/);
	});

	it('Date をそのまま渡しても同じ結果になる', () => {
		expect(formatDateJa(new Date(iso))).toBe(formatDateJa(iso));
	});
});

describe('formatDateTimeJa', () => {
	const iso = '2026-08-29T10:30:00.000Z';

	it('ja-JP ロケールの日付＋時刻表示を返す', () => {
		expect(formatDateTimeJa(iso)).toBe(new Date(iso).toLocaleString('ja-JP'));
	});

	it('時刻を含む', () => {
		expect(formatDateTimeJa(iso)).toMatch(/:/);
	});

	it('日付のみの表示を接頭辞として含む', () => {
		expect(formatDateTimeJa(iso).startsWith(formatDateJa(iso))).toBe(true);
	});

	it('Date をそのまま渡しても同じ結果になる', () => {
		expect(formatDateTimeJa(new Date(iso))).toBe(formatDateTimeJa(iso));
	});
});
