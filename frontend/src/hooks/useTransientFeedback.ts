import { useCallback, useEffect, useRef, useState } from 'react';

export type FeedbackTone = 'success' | 'error';

export interface Feedback {
	tone: FeedbackTone;
	message: string;
}

/** フィードバックを自動的に消すまでの時間（ミリ秒）。 */
export const FEEDBACK_AUTO_DISMISS_MS = 3000;

/**
 * 一定時間で自動的に消えるフィードバックメッセージの状態を管理する。
 * 表示のスタイリングは呼び出し側が担う。
 */
export const useTransientFeedback = (autoDismissMs: number = FEEDBACK_AUTO_DISMISS_MS) => {
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const showFeedback = useCallback(
		(tone: FeedbackTone, message: string) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			setFeedback({ tone, message });
			timerRef.current = setTimeout(() => setFeedback(null), autoDismissMs);
		},
		[autoDismissMs],
	);

	return { feedback, showFeedback };
};
