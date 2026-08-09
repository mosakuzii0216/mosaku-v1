/** UTC から日本標準時（JST, UTC+9）へのオフセット（ミリ秒）。 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 与えられた日時を JST に換算し、`YYYY-MM-DD` 形式の日付文字列を返す。 */
export const toJSTDateString = (date: Date): string => {
	const jst = new Date(date.getTime() + JST_OFFSET_MS);
	return jst.toISOString().split('T')[0];
};
