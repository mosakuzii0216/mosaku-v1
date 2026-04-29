/**
 * Sentry beforeSend フック内で event の PII をマスクする純関数群。
 * - キー名ブラックリスト + 値の正規表現の二軸で redact する
 * - 元 event を破壊変更しない（新規オブジェクトを返す）
 * - WeakSet で循環参照をガードする
 * - 10KB を超える文字列は truncate してから redact する
 */

export const DEFAULT_REDACTABLE_KEYS: ReadonlySet<string> = new Set([
	'content',
	'body',
	'html',
	'code',
	'password',
	'newPassword',
	'currentPassword',
	'token',
	'accessToken',
	'refreshToken',
	'invitationCode',
	'clientSecret',
	'privateKey',
]);

const JWT_REGEX = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export const DEFAULT_VALUE_PATTERNS: ReadonlyArray<RegExp> = [JWT_REGEX, UUID_REGEX];

export const DEFAULT_PLACEHOLDER = '[REDACTED]';
const TRUNCATE_LIMIT = 10_000;
const TRUNCATE_SUFFIX = '...[TRUNCATED]';

export interface ScrubberOptions {
	readonly redactableKeys: ReadonlySet<string>;
	readonly valuePatterns: ReadonlyArray<RegExp>;
	readonly placeholder: string;
}

export interface SentryScrubber {
	scrub<TEvent extends Record<string, unknown>>(event: TEvent): TEvent;
}

export function createScrubber(options: Partial<ScrubberOptions> = {}): SentryScrubber {
	const config: ScrubberOptions = {
		redactableKeys: options.redactableKeys ?? DEFAULT_REDACTABLE_KEYS,
		valuePatterns: options.valuePatterns ?? DEFAULT_VALUE_PATTERNS,
		placeholder: options.placeholder ?? DEFAULT_PLACEHOLDER,
	};

	return {
		scrub<TEvent extends Record<string, unknown>>(event: TEvent): TEvent {
			const seen = new WeakSet<object>();
			return walk(event, config, seen) as TEvent;
		},
	};
}

function walk(value: unknown, config: ScrubberOptions, seen: WeakSet<object>): unknown {
	if (typeof value === 'string') {
		return scrubString(value, config);
	}

	if (Array.isArray(value)) {
		if (seen.has(value)) {
			return [];
		}
		seen.add(value);
		return value.map((item) => walk(item, config, seen));
	}

	if (value !== null && typeof value === 'object') {
		if (seen.has(value)) {
			return {};
		}
		seen.add(value);

		const source = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(source)) {
			if (config.redactableKeys.has(key)) {
				result[key] = config.placeholder;
				continue;
			}
			result[key] = walk(child, config, seen);
		}
		return result;
	}

	return value;
}

function scrubString(value: string, config: ScrubberOptions): string {
	const truncated =
		value.length > TRUNCATE_LIMIT ? value.slice(0, TRUNCATE_LIMIT) + TRUNCATE_SUFFIX : value;

	for (const pattern of config.valuePatterns) {
		if (pattern.test(truncated)) {
			return config.placeholder;
		}
	}

	return truncated;
}
