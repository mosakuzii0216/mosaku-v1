import { describe, expect, it } from 'vitest';

import { stripHtml } from './strip-html';

describe('stripHtml', () => {
	it('returns empty string for empty input', () => {
		expect(stripHtml('')).toBe('');
	});

	it('extracts plain text from HTML elements', () => {
		expect(stripHtml('<p>hello <strong>world</strong></p>')).toBe('hello world');
	});

	it('preserves multibyte characters intact', () => {
		expect(stripHtml('<p>こんにちは<br>世界</p>')).toBe('こんにちは世界');
	});

	it('drops nested tags but keeps inner text', () => {
		expect(stripHtml('<div><p>Outer <em>inner</em> text</p></div>')).toBe('Outer inner text');
	});

	it('returns empty string when input is only tags', () => {
		expect(stripHtml('<br><hr/>')).toBe('');
	});
});
