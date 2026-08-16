/**
 * Sentry production smoke test 用に意図的にスローされるエラー。
 *
 * 既存の `instrument.ts` の `ignoreErrors` には 429 非該当の 4xx クラス名のみが
 * 登録されているため、本クラスはそこに含まれず Sentry に必ず届く。
 * Production 初回デプロイ時に release / source map / Slack 連携が想定通り
 * 動作するかの確認用に使う。
 */
export class SentrySmokeTestError extends Error {
	static readonly NAME = 'SentrySmokeTestError';

	constructor(message: string = 'Sentry production smoke test - intentional error') {
		super(message);
		this.name = SentrySmokeTestError.NAME;
	}
}
