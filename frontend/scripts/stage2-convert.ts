/**
 * Stage2: HTML → ProseMirror JSON 変換（フロントエンド側・jsdom + @tiptap/html 使用）
 *
 * dry-run モード（--dry-run）: 変換のみ実行、書込は行わない。件数突合レポートを出力。
 * 通常モード: 変換結果を output NDJSON に書き出す。
 *
 * 使用法:
 *   node --loader ts-node/esm scripts/stage2-convert.ts <input-ndjson> [output-ndjson] [--dry-run]
 *   入出力省略時: ./migration-export.ndjson → ./migration-converted.ndjson
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { RawRecord } from '../src/utils/migration/htmlToJson.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// jsdom をセットアップして @tiptap/html（browser 版）が使える環境を作る
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const domWindow = dom.window;
// @ts-expect-error - global DOM setup for @tiptap/html browser version
global.window = domWindow;
// @ts-expect-error
global.document = domWindow.document;
// @ts-expect-error
global.DOMParser = domWindow.DOMParser;
// @ts-expect-error
global.Element = domWindow.Element;
// @ts-expect-error
global.Node = domWindow.Node;
// @ts-expect-error
global.HTMLElement = domWindow.HTMLElement;

// jsdom セットアップ後に動的インポート
const { batchConvert } = await import('../src/utils/migration/htmlToJson.js');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const filteredArgs = args.filter((a) => a !== '--dry-run');

const inputFile = filteredArgs[0] || resolve(__dirname, '../migration-export.ndjson');
const outputFile = filteredArgs[1] || resolve(__dirname, '../migration-converted.ndjson');

console.log('Stage2: 変換開始');
if (isDryRun) console.log('  [dry-run モード: 書込なし]');
console.log(`入力: ${inputFile}`);
if (!isDryRun) console.log(`出力: ${outputFile}`);

const rawContent = readFileSync(inputFile, 'utf8');
const records: RawRecord[] = rawContent
	.split('\n')
	.filter((line) => line.trim())
	.map((line) => JSON.parse(line) as RawRecord);

console.log(`${records.length} 件を変換します...`);

const { results, stats } = batchConvert(records);

console.log('\n=== 変換レポート ===');
console.log(`合計:         ${stats.total} 件`);
console.log(`成功:         ${stats.successCount} 件`);
console.log(`空doc:        ${stats.emptyDocCount} 件`);
console.log(`フォールバック: ${stats.fallbackCount} 件`);
console.log(`NULL維持:     ${stats.nullKeptCount} 件`);

if (stats.errorIds.length > 0) {
	console.log('\n⚠️  フォールバック発生ID（要確認）:');
	for (const id of stats.errorIds) {
		const r = results.find((x) => x.id === id);
		console.log(`  ${id}: ${r?.error ?? 'unknown error'}`);
	}
}

if (isDryRun) {
	console.log('\n[dry-run] 書込をスキップしました。');
	process.exit(0);
}

const lines = results.map((r) => JSON.stringify(r));
writeFileSync(outputFile, lines.join('\n') + '\n', 'utf8');
console.log(`\n変換結果を書き出しました → ${outputFile}`);
