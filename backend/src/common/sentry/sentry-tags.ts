export type FeatureArea =
	| 'memo'
	| 'notebook'
	| 'tag'
	| 'theme'
	| 'auth'
	| 'invitation'
	| 'dashboard'
	| 'system'
	| 'unknown';

export interface StandardTags {
	feature_area: FeatureArea;
	user_facing: boolean;
	controller?: string;
	handler?: string;
	route?: string;
}

export interface TaggedEvent<TEvent extends Record<string, unknown>> {
	readonly event: TEvent;
	readonly tags: StandardTags;
}

const FEATURE_AREA_PREFIXES: ReadonlyArray<readonly [string, FeatureArea]> = [
	['/memo', 'memo'],
	['/memos', 'memo'],
	['/notebook', 'notebook'],
	['/notebooks', 'notebook'],
	['/tag', 'tag'],
	['/tags', 'tag'],
	['/theme', 'theme'],
	['/themes', 'theme'],
	['/auth', 'auth'],
	['/invitation', 'invitation'],
	['/invitations', 'invitation'],
	['/dashboard', 'dashboard'],
	['/health', 'system'],
	['/system', 'system'],
];

// 公開メモ読み取り経路（GET /memos/public/:token）のトークンは「秘密値」かつ「1件ごとに別ラベル化する
// 高カーディナリティ値」のため、route タグ・request.url の双方で安定ラベル :token に正規化する。
// これにより公開経路を 1 ルートに集約して計測でき（Req 1.1）、秘密トークンの Sentry 流出も防ぐ。
const PUBLIC_MEMO_TOKEN_PATTERN = /\/memos\/public\/[^/?#]+/;
export const PUBLIC_MEMO_NORMALIZED_PATH = '/memos/public/:token';

export function normalizeRoute(value: string): string {
	return value.replace(PUBLIC_MEMO_TOKEN_PATTERN, PUBLIC_MEMO_NORMALIZED_PATH);
}

// scrubber は JWT / UUID パターンしか値 redact しないため、base64url の公開トークンは素通りする。
// route タグだけでなく event.request.url 本体からもトークンを取り除き、秘密値の保存を防ぐ。
export function sanitizeRequestUrl<TEvent extends Record<string, unknown>>(event: TEvent): TEvent {
	const request = event.request as { url?: string } | undefined;
	if (!request || typeof request.url !== 'string') {
		return event;
	}
	const normalized = normalizeRoute(request.url);
	if (normalized === request.url) {
		return event;
	}
	return {
		...event,
		request: { ...request, url: normalized },
	};
}

export function resolveFeatureArea(url: string | undefined): FeatureArea {
	if (!url) {
		return 'unknown';
	}

	const pathname = extractPathname(url);

	for (const [prefix, area] of FEATURE_AREA_PREFIXES) {
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
			return area;
		}
	}

	return 'unknown';
}

export function applyStandardTags<TEvent extends Record<string, unknown>>(
	event: TEvent,
): TaggedEvent<TEvent> {
	const request = (event.request ?? {}) as { url?: string };
	const url = request.url;
	const pathname = url ? extractPathname(url) : undefined;

	const contexts = (event.contexts ?? {}) as { response?: { status_code?: number } };
	const statusCode = contexts.response?.status_code;
	const userFacing = typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600;

	const transaction = typeof event.transaction === 'string' ? event.transaction : undefined;
	const { controller, handler } = parseTransaction(transaction);

	const tags: StandardTags = {
		feature_area: resolveFeatureArea(url),
		user_facing: userFacing,
		...(controller !== undefined ? { controller } : {}),
		...(handler !== undefined ? { handler } : {}),
		...(pathname !== undefined ? { route: normalizeRoute(pathname) } : {}),
	};

	return { event, tags };
}

function extractPathname(url: string): string {
	try {
		if (/^https?:\/\//i.test(url)) {
			return new URL(url).pathname;
		}
	} catch {
		// URL コンストラクタ失敗時は raw に戻す
	}

	const queryIndex = url.indexOf('?');
	const pathOnly = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
	const hashIndex = pathOnly.indexOf('#');
	return hashIndex >= 0 ? pathOnly.slice(0, hashIndex) : pathOnly;
}

function parseTransaction(transaction: string | undefined): {
	controller?: string;
	handler?: string;
} {
	if (!transaction) {
		return {};
	}

	const dotIndex = transaction.indexOf('.');
	if (dotIndex === -1) {
		return { controller: transaction };
	}

	return {
		controller: transaction.slice(0, dotIndex),
		handler: transaction.slice(dotIndex + 1),
	};
}
