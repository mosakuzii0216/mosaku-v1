import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ゴミ箱に入れたメモを物理削除するまでの保持日数。
 *
 * frontend の `src/constants/trash.ts` の TRASH_RETENTION_DAYS と同じ値を保つこと。
 * パッケージを跨ぐため型では縛れず、片方だけ変更しても何も落ちない。ズレると画面の
 * 「自動削除まで N 日」と実際に消えるタイミングが食い違う。
 */
export const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class TrashCleanupService {
	private readonly logger = new Logger(TrashCleanupService.name);

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * 毎日 JST 02:00（UTC 17:00）に TRASH_RETENTION_DAYS 日以上前にゴミ箱移動されたメモを自動削除する
	 * Requirements: 5.1, 5.2
	 */
	@Cron('0 17 * * *')
	async cleanupOldTrashedMemos(): Promise<void> {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);

		const result = await this.prisma.memo.deleteMany({
			where: {
				trashedAt: {
					lte: cutoff,
				},
			},
		});

		this.logger.log(`ゴミ箱クリーンアップ完了: ${result.count} 件のメモを削除しました`);
	}
}
