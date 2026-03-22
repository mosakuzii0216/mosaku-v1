import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrashCleanupService {
	private readonly logger = new Logger(TrashCleanupService.name);

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * 毎日 JST 02:00（UTC 17:00）に30日以上前にゴミ箱移動されたメモを自動削除する
	 * Requirements: 5.1, 5.2
	 */
	@Cron('0 17 * * *')
	async cleanupOldTrashedMemos(): Promise<void> {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - 30);

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
