import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

/**
 * アプリケーション全体で使用する統一的なロガーサービス
 */
@Injectable()
export class AppLogger implements NestLoggerService {
	private context?: string;

	/**
	 * ロガーのコンテキストを設定
	 */
	setContext(context: string): void {
		this.context = context;
	}

	/**
	 * 通常のログ出力
	 */
	log(message: string, context?: string): void {
		const logContext = context || this.context || 'Application';
		console.log(`[${logContext}] ${message}`);
	}

	/**
	 * エラーログ出力
	 */
	error(message: string, trace?: string, context?: string): void {
		const logContext = context || this.context || 'Application';
		console.error(`[${logContext}] ${message}`);
		if (trace) {
			console.error(trace);
		}
	}

	/**
	 * 警告ログ出力
	 */
	warn(message: string, context?: string): void {
		const logContext = context || this.context || 'Application';
		console.warn(`[${logContext}] ${message}`);
	}

	/**
	 * デバッグログ出力（開発環境のみ）
	 */
	debug(message: string, context?: string): void {
		if (process.env.NODE_ENV === 'development') {
			const logContext = context || this.context || 'Application';
			console.debug(`[${logContext}] ${message}`);
		}
	}

	/**
	 * 詳細ログ出力
	 */
	verbose(message: string, context?: string): void {
		if (process.env.NODE_ENV === 'development') {
			const logContext = context || this.context || 'Application';
			console.log(`[${logContext}] [VERBOSE] ${message}`);
		}
	}
}
