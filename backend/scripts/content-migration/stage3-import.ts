/**
 * Stage3: 変換結果（contentJson / contentText）を staging 列へ id 突合で書き戻し
 *
 * 実行環境: expand マイグレーション（Migration A）適用後・cutover（Migration B）適用前
 * 前提: content_json / content_text 列が存在すること（Migration A が適用済み）
 * 冪等: 同一 id への再実行で結果は変わらない（UPDATE で上書き）
 *
 * 使用法: npx ts-node scripts/content-migration/stage3-import.ts <converted-ndjson>
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

interface ConversionResult {
	id: string;
	contentJson: unknown | null;
	contentText: string;
	fallback: boolean;
	error?: string;
}

async function main() {
	const inputFile = process.argv[2] || path.resolve(__dirname, './migration-converted.ndjson');

	console.log('Stage3: インポート開始');
	console.log(`入力: ${inputFile}`);

	const rawContent = fs.readFileSync(inputFile, 'utf8');
	const results: ConversionResult[] = rawContent
		.split('\n')
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as ConversionResult);

	console.log(`${results.length} 件を書き戻します...`);

	let successCount = 0;
	let skipCount = 0;
	let errorCount = 0;

	for (const result of results) {
		try {
			if (result.contentJson === null) {
				// Notebook NULL → content_text のみ更新（content_json は NULL のまま）
				await prisma.$executeRaw(
					Prisma.sql`UPDATE notebooks SET content_text = ${result.contentText} WHERE id = ${result.id}`,
				);
			} else {
				const jsonStr = JSON.stringify(result.contentJson);

				// memos と notebooks を両方試みる（id は cuid で一意なのでどちらか一方だけ更新される）
				const memoUpdated = await prisma.$executeRaw(
					Prisma.sql`UPDATE memos SET content_json = ${jsonStr}::jsonb, content_text = ${result.contentText} WHERE id = ${result.id}`,
				);
				if (memoUpdated === 0) {
					await prisma.$executeRaw(
						Prisma.sql`UPDATE notebooks SET content_json = ${jsonStr}::jsonb, content_text = ${result.contentText} WHERE id = ${result.id}`,
					);
				}
			}
			successCount++;
		} catch (e) {
			console.error(`  エラー (id=${result.id}):`, e);
			errorCount++;
		}
	}

	console.log(`\n=== インポート完了 ===`);
	console.log(`成功: ${successCount} 件`);
	console.log(`スキップ: ${skipCount} 件`);
	console.log(`エラー: ${errorCount} 件`);

	if (errorCount > 0) {
		console.error(`\n⚠️  ${errorCount} 件のエラーが発生しました。cutover を実行しないでください。`);
		process.exit(1);
	}
}

main()
	.catch((e) => {
		console.error('Stage3 エラー:', e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
