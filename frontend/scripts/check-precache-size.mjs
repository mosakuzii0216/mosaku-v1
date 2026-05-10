#!/usr/bin/env node
/**
 * App-shell precache サイズ計測ガード。
 *
 * Requirement 8.3 / Task 1.1:
 *   "precache 後のサイズが既存ビルドサイズの 1.5 倍以下に収まることを CI で計測する"
 *
 * 動作:
 *   - dist/ 配下の precache 対象ファイル（globPatterns 範囲）を集計し、
 *     themes/*.css は globIgnores によって除外したサイズを算出する。
 *   - 環境変数 PRECACHE_BASELINE_BYTES が設定されている場合、
 *     合計サイズ <= baseline * 1.5 を満たさなければ exit 1。
 *   - 未設定の場合は計測値を出力するだけで pass する（初回ベースライン取得用）。
 */
import { readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PRECACHE_EXTS = new Set(['.js', '.css', '.html', '.svg', '.png', '.ico', '.woff2']);
const THEME_DIR_FRAGMENT = `${'/'}themes${'/'}`;

function* walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		throw new Error(`dist ディレクトリが見つかりません: ${dir} (${err.message})`);
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(full);
		} else if (entry.isFile()) {
			yield full;
		}
	}
}

function isPrecacheTarget(filePath) {
	const ext = extname(filePath).toLowerCase();
	if (!PRECACHE_EXTS.has(ext)) return false;
	const rel = `/${relative(DIST, filePath).split('\\').join('/')}`;
	if (rel.includes(THEME_DIR_FRAGMENT)) return false;
	return true;
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
	let total = 0;
	const counted = [];
	for (const file of walk(DIST)) {
		if (!isPrecacheTarget(file)) continue;
		const size = statSync(file).size;
		total += size;
		counted.push({ rel: relative(DIST, file), size });
	}

	counted.sort((a, b) => b.size - a.size);
	const top = counted.slice(0, 5);

	console.log('=== Precache size report ===');
	console.log(`files counted: ${counted.length}`);
	console.log(`total size:    ${formatBytes(total)} (${total} bytes)`);
	console.log('top files:');
	for (const f of top) {
		console.log(`  ${formatBytes(f.size).padStart(10)}  ${f.rel}`);
	}

	const baselineRaw = process.env.PRECACHE_BASELINE_BYTES;
	if (!baselineRaw) {
		console.log('\nPRECACHE_BASELINE_BYTES is not set — skipping ratio check.');
		console.log(
			'To enforce the 1.5x guard in CI, set this env var to the previous build size in bytes.',
		);
		return;
	}
	const baseline = Number(baselineRaw);
	if (!Number.isFinite(baseline) || baseline <= 0) {
		console.error(`Invalid PRECACHE_BASELINE_BYTES: ${baselineRaw}`);
		process.exit(2);
	}
	const limit = baseline * 1.5;
	const ratio = total / baseline;
	console.log(`\nbaseline:      ${formatBytes(baseline)}`);
	console.log(`limit (1.5x):  ${formatBytes(limit)}`);
	console.log(`ratio:         ${ratio.toFixed(2)}x`);
	if (total > limit) {
		console.error('\nFAIL: precache size exceeds baseline * 1.5.');
		process.exit(1);
	}
	console.log('\nOK: precache size within budget.');
}

main();
