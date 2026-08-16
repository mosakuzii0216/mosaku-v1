const TZ_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/;

export function isValidIso8601(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0) return false;
	if (!TZ_SUFFIX.test(value)) return false;
	const parsed = new Date(value);
	return !Number.isNaN(parsed.getTime());
}
