/**
 * 環境変数で制御されるロガーユーティリティ
 * 本番環境では重要なログのみを出力し、デバッグログは無効化
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

class AppLogger implements Logger {
	private isDevelopment = import.meta.env.DEV;

	/**
	 * デバッグログ（開発環境のみ）
	 */
	debug(...args: unknown[]): void {
		if (this.isDevelopment) {
			console.log('[DEBUG]', ...args);
		}
	}

	/**
	 * 情報ログ（開発環境のみ）
	 */
	info(...args: unknown[]): void {
		if (this.isDevelopment) {
			console.log('[INFO]', ...args);
		}
	}

	/**
	 * 警告ログ（全環境で出力）
	 */
	warn(...args: unknown[]): void {
		console.warn('[WARN]', ...args);
	}

	/**
	 * エラーログ（全環境で出力）
	 */
	error(...args: unknown[]): void {
		console.error('[ERROR]', ...args);
	}

	/**
	 * 条件付きログ
	 * @param condition 条件式
	 * @param level ログレベル
	 * @param args ログメッセージ
	 */
	conditionalLog(condition: boolean, level: LogLevel, ...args: unknown[]): void {
		if (condition) {
			this[level](...args);
		}
	}
}

/**
 * グローバルロガーインスタンス
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger';
 *
 * logger.debug('デバッグ情報'); // 開発環境のみ出力
 * logger.info('一般情報'); // 開発環境のみ出力
 * logger.warn('警告'); // 常に出力
 * logger.error('エラー'); // 常に出力
 * ```
 */
export const logger = new AppLogger();
