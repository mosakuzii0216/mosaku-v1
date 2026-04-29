/**
 * Sentry beforeSend 内で event に構造化タグを付与する純関数群。
 * - feature_area: URL prefix から推定
 * - user_facing: 5xx のみ true
 * - controller / handler: NestJS の transaction プロパティから抽出
 * - route: pathname （クエリ文字列除外）
 */

export type FeatureArea =
	| 'memo'
	| 'notebook'
	| 'tag'
	| 'theme'
	| 'auth'
	| 'invitation'
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
	['/health', 'system'],
	['/system', 'system'],
];

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
		...(pathname !== undefined ? { route: pathname } : {}),
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
