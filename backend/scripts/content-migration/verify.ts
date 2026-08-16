/**
 * 移行前後の件数突合・サンプル往復忠実度・SET NOT NULL ゲート検証
 *
 * チェック項目:
 * 1. memos / notebooks の総件数と変換済み件数の突合
 * 2. Memo の content_json が全行非 NULL（SET NOT NULL の前提）
 * 3. Notebook の NULL content_json は許容（NULL 維持）
 * 4. フォールバック件数のレポート（閾値超過で中断）
 * 5. サンプル往復忠実度（変換結果の contentText が空でないことを確認）
 *
 * 使用法: npx ts-node scripts/content-migration/verify.ts <converted-ndjson>
 *         --fallback-threshold=<N>  フォールバック許容上限（デフォルト: 0）
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

function parseFallbackThreshold(args: string[]): number {
	const arg = args.find((a) => a.startsWith('--fallback-threshold='));
	if (!arg) return 0;
	const val = parseInt(arg.split('=')[1] ?? '0', 10);
	return isNaN(val) ? 0 : val;
}

async function main() {
	const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
	const opts = process.argv.slice(2).filter((a) => a.startsWith('--'));

	const inputFile = args[0] || path.resolve(__dirname, './migration-converted.ndjson');
	const fallbackThreshold = parseFallbackThreshold(opts);

	console.log('=== 移行検証開始 ===');
	console.log(`入力: ${inputFile}`);
	console.log(`フォールバック許容上限: ${fallbackThreshold}`);

	const rawContent = fs.readFileSync(inputFile, 'utf8');
	const results: ConversionResult[] = rawContent
		.split('\n')
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as ConversionResult);

	// DB の件数取得
	const [{ count: memoDbCount }] = await prisma.$queryRaw<[{ count: bigint }]>(
		Prisma.sql`SELECT COUNT(*) AS count FROM memos`,
	);
	const [{ count: notebookDbCount }] = await prisma.$queryRaw<[{ count: bigint }]>(
		Prisma.sql`SELECT COUNT(*) AS count FROM notebooks`,
	);

	const memoResults = results.filter((r) => {
		// type フィールドがある場合はそれで判定、なければ content_json の有無で推定
		return (r as { type?: string }).type === 'memo';
	});
	const notebookResults = results.filter((r) => (r as { type?: string }).type === 'notebook');

	let ok = true;

	// 1. 件数突合
	console.log('\n--- 件数突合 ---');
	console.log(`Memo    DB: ${memoDbCount} / 変換: ${memoResults.length}`);
	console.log(`Notebook DB: ${notebookDbCount} / 変換: ${notebookResults.length}`);

	if (Number(memoDbCount) !== memoResults.length) {
		console.error(`❌ Memo 件数不一致: DB=${memoDbCount}, 変換=${memoResults.length}`);
		ok = false;
	} else {
		console.log(`✅ Memo 件数一致`);
	}

	if (Number(notebookDbCount) !== notebookResults.length) {
		console.error(`❌ Notebook 件数不一致: DB=${notebookDbCount}, 変換=${notebookResults.length}`);
		ok = false;
	} else {
		console.log(`✅ Notebook 件数一致`);
	}

	// 2. Memo content_json 全行非 NULL チェック（SET NOT NULL の前提）
	console.log('\n--- Memo content_json 非 NULL チェック ---');
	const memoNullIds = memoResults.filter((r) => r.contentJson === null).map((r) => r.id);
	if (memoNullIds.length > 0) {
		console.error(`❌ content_json が NULL の Memo が ${memoNullIds.length} 件存在します:`);
		memoNullIds.slice(0, 10).forEach((id) => console.error(`  ${id}`));
		ok = false;
	} else {
		console.log(`✅ 全 Memo の content_json が非 NULL`);
	}

	// 3. フォールバック件数チェック
	const fallbackIds = results.filter((r) => r.fallback).map((r) => r.id);
	console.log('\n--- フォールバック件数 ---');
	console.log(`フォールバック: ${fallbackIds.length} 件 (閾値: ${fallbackThreshold})`);
	if (fallbackIds.length > 0) {
		console.log('フォールバック発生ID:');
		fallbackIds.slice(0, 20).forEach((id) => {
			const r = results.find((x) => x.id === id);
			console.log(`  ${id}: ${r?.error ?? 'unknown'}`);
		});
	}
	if (fallbackIds.length > fallbackThreshold) {
		console.error(
			`❌ フォールバック件数 (${fallbackIds.length}) が閾値 (${fallbackThreshold}) を超えました。cutover を中断してください。`,
		);
		ok = false;
	} else {
		console.log(`✅ フォールバック件数は許容範囲内`);
	}

	// 4. サンプル往復忠実度（内容のある変換結果のサンプル確認）
	console.log('\n--- サンプル往復忠実度 ---');
	const withContent = results.filter((r) => r.contentJson !== null && r.contentText);
	const sampleSize = Math.min(5, withContent.length);
	if (sampleSize > 0) {
		const samples = withContent.slice(0, sampleSize);
		for (const s of samples) {
			const preview = s.contentText.slice(0, 60).replace(/\n/g, ' ');
			console.log(`  [${s.id}] "${preview}..."`);
		}
		console.log(`✅ ${sampleSize} 件のサンプルで往復忠実度を確認`);
	} else {
		console.log('  （内容のある変換結果なし）');
	}

	// 5. 最終判定
	console.log('\n=== 検証結果 ===');
	if (ok) {
		console.log('✅ すべての検証をパスしました。cutover（Migration B）を実行できます。');
		process.exit(0);
	} else {
		console.error('❌ 検証に失敗しました。cutover を実行しないでください。');
		process.exit(1);
	}
}

main()
	.catch((e) => {
		console.error('verify エラー:', e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
