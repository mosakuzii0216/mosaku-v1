import { describe, expect, it } from 'vitest';

import { isValidIso8601 } from './iso8601';

describe('isValidIso8601', () => {
	it('accepts UTC timestamps with Z suffix', () => {
		expect(isValidIso8601('2026-05-09T12:00:00.000Z')).toBe(true);
	});

	it('accepts timestamps with explicit offset', () => {
		expect(isValidIso8601('2026-05-09T21:00:00+09:00')).toBe(true);
		expect(isValidIso8601('2026-05-09T21:00:00.123-05:00')).toBe(true);
	});

	it('rejects timestamps without timezone information', () => {
		expect(isValidIso8601('2026-05-09T12:00:00')).toBe(false);
	});

	it('rejects empty string and non-string values', () => {
		expect(isValidIso8601('')).toBe(false);
		expect(isValidIso8601(undefined)).toBe(false);
		expect(isValidIso8601(123)).toBe(false);
	});

	it('rejects unparseable strings', () => {
		expect(isValidIso8601('not-a-date')).toBe(false);
		expect(isValidIso8601('2026-13-01T00:00:00Z')).toBe(false);
	});
});
