/**
 * 日付の表示フォーマット。
 *
 * 表示ロケールを 1 箇所に集約し、画面ごとに書式が散らばるのを防ぐ。
 * 相対表示（「3日前」など）は各画面の文脈に依存するためここでは扱わない。
 */

const DISPLAY_LOCALE = 'ja-JP';

/** 日付を「日付のみ」の表示に整える。例: 2026/8/29 */
export const formatDateJa = (value: string | Date): string =>
	new Date(value).toLocaleDateString(DISPLAY_LOCALE);

/** 日付を「日付＋時刻」の表示に整える。例: 2026/8/29 19:45:00 */
export const formatDateTimeJa = (value: string | Date): string =>
	new Date(value).toLocaleString(DISPLAY_LOCALE);
