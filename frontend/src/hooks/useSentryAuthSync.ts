import { useEffect } from 'react';
import * as Sentry from '@sentry/react';

/**
 * 認証状態を Sentry scope に同期するフック。
 * - user が存在する場合: `Sentry.setUser({ id })` のみを呼び、email / OAuth provider / display name は絶対に渡さない
 * - user が null の場合: `Sentry.setUser(null)` を呼び scope を匿名に戻す
 *
 * 呼び出し元の AuthProvider が user state を切り替えるだけで、ログイン / ログアウト /
 * token refresh 失敗の全経路で副作用が一元化される。
 */
export function useSentryAuthSync(user: { id: string } | null): void {
	const userId = user?.id ?? null;

	useEffect(() => {
		if (userId) {
			Sentry.setUser({ id: userId });
		} else {
			Sentry.setUser(null);
		}
	}, [userId]);
}
