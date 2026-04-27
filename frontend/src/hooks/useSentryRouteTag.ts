import { useEffect } from 'react';
import { useLocation } from 'react-router';
import * as Sentry from '@sentry/react';

/**
 * React Router v7 の pathname 変化を Sentry scope の `route` タグに同期するフック。
 * 動的セグメント（`/memo/:id`）はそのまま pathname として送信する。
 * high-cardinality 問題は MVP では許容し、後続改善で `matchPath` によるパターン化を行う予定。
 */
export function useSentryRouteTag(): void {
	const { pathname } = useLocation();

	useEffect(() => {
		Sentry.getCurrentScope().setTag('route', pathname);
	}, [pathname]);
}
