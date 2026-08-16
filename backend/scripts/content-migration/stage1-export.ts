/**
 * Stage1: DB から HTML 本文を NDJSON へエクスポート
 *
 * 実行環境: expand マイグレーション（Migration A）適用後・cutover（Migration B）適用前
 * 使用法: npx ts-node scripts/content-migration/stage1-export.ts <output-file>
 *         出力先省略時は ./migration-export.ndjson
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

interface RawMemoRow {
	id: string;
	content: string | null;
}

interface ExportRecord {
	id: string;
	content: string | null;
	type: 'memo' | 'notebook';
}

async function main() {
	const outputFile = process.argv[2] || path.resolve(__dirname, './migration-export.ndjson');

	console.log('Stage1: エクスポート開始');
	console.log(`出力先: ${outputFile}`);

	const memos = await prisma.$queryRaw<RawMemoRow[]>(
		Prisma.sql`SELECT id, content::text AS content FROM memos ORDER BY id`,
	);
	console.log(`メモ: ${memos.length} 件`);

	const notebooks = await prisma.$queryRaw<RawMemoRow[]>(
		Prisma.sql`SELECT id, content::text AS content FROM notebooks ORDER BY id`,
	);
	console.log(`ノートブック: ${notebooks.length} 件`);

	const lines: string[] = [];
	for (const m of memos) {
		const record: ExportRecord = { id: m.id, content: m.content, type: 'memo' };
		lines.push(JSON.stringify(record));
	}
	for (const n of notebooks) {
		const record: ExportRecord = { id: n.id, content: n.content, type: 'notebook' };
		lines.push(JSON.stringify(record));
	}

	fs.writeFileSync(outputFile, lines.join('\n') + '\n', 'utf8');

	console.log(`合計 ${lines.length} 件をエクスポートしました → ${outputFile}`);
}

main()
	.catch((e) => {
		console.error('Stage1 エラー:', e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
