#!/usr/bin/env node
/**
 * =============================================================================
 * lockfile 同期チェック
 * =============================================================================
 *
 * 背景:
 *   本リポジトリは npm workspaces を使いつつ、backend/ は Docker のビルド
 *   コンテキストが backend/ 単独であるため独自の package-lock.json を持つ。
 *   結果として lockfile が root / backend / frontend の 3 系統存在し、
 *   Dependabot もこの 3 系統それぞれに PR を出す。
 *
 *   このため「片方の lockfile だけが更新され、もう片方が取り残される」ズレが
 *   構造的に発生しうる。実際 ecc147f では backend/package.json から OAuth 依存を
 *   削除した際に root の lockfile だけが追随し、backend/package-lock.json に
 *   宣言が幽霊として残った。
 *
 *   npm ci は「package.json にあって lockfile に無い依存」でしか失敗せず、
 *   逆向きのズレ（削除漏れ）は素通りするため、専用の検査が要る。
 *
 * 検査内容:
 *   package.json の dependencies / devDependencies の「名前 → semver 範囲」が、
 *   対応する lockfile の宣言と完全に一致することを確認する。
 *   root の lockfile については、各 workspace エントリも併せて検査する。
 *
 * 終了コード:
 *   0 = 全ペア一致 / 1 = ズレを検出（CI を失敗させる）
 * =============================================================================
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 検査対象の依存フィールド。peer / optional は解決結果が環境依存なので対象外。 */
const DEP_FIELDS = ['dependencies', 'devDependencies'];

/**
 * 検査ペア。
 * entry は lockfile の packages[...] のキー。'' は lockfile 自身のルートパッケージ、
 * 'backend' / 'frontend' は workspace エントリを指す。
 */
const PAIRS = [
  { label: 'root package.json ↔ root lockfile', pkg: 'package.json', lock: 'package-lock.json', entry: '' },
  {
    label: 'backend/package.json ↔ backend lockfile',
    pkg: 'backend/package.json',
    lock: 'backend/package-lock.json',
    entry: '',
  },
  {
    label: 'frontend/package.json ↔ frontend lockfile',
    pkg: 'frontend/package.json',
    lock: 'frontend/package-lock.json',
    entry: '',
  },
  {
    label: 'backend/package.json ↔ root lockfile (workspace)',
    pkg: 'backend/package.json',
    lock: 'package-lock.json',
    entry: 'backend',
  },
  {
    label: 'frontend/package.json ↔ root lockfile (workspace)',
    pkg: 'frontend/package.json',
    lock: 'package-lock.json',
    entry: 'frontend',
  },
];

const readJson = (relPath) => JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf8'));

/** dependencies / devDependencies を "field:name" => range のフラットな map にする。 */
const declaredDeps = (source) => {
  const map = new Map();
  for (const field of DEP_FIELDS) {
    for (const [name, range] of Object.entries(source?.[field] ?? {})) {
      map.set(`${field}:${name}`, range);
    }
  }
  return map;
};

/** GitHub Actions のアノテーションとして拾われる形式で出力する。 */
const annotate = (file, message) => {
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error file=${file}::${message}`);
  }
};

let failed = false;

for (const { label, pkg, lock, entry } of PAIRS) {
  if (!existsSync(resolve(repoRoot, pkg)) || !existsSync(resolve(repoRoot, lock))) {
    console.log(`⏭  ${label} — ファイルが存在しないためスキップ`);
    continue;
  }

  const lockJson = readJson(lock);
  const lockEntry = lockJson.packages?.[entry];

  if (!lockEntry) {
    console.error(`❌ ${label}`);
    console.error(`   ${lock} に packages["${entry}"] が存在しません`);
    annotate(lock, `packages["${entry}"] が存在しません`);
    failed = true;
    continue;
  }

  const fromPkg = declaredDeps(readJson(pkg));
  const fromLock = declaredDeps(lockEntry);

  const missing = []; // package.json にあるのに lockfile に無い
  const ghost = []; // lockfile に残っているのに package.json に無い
  const mismatched = []; // 両方にあるが semver 範囲が違う

  for (const [key, range] of fromPkg) {
    if (!fromLock.has(key)) missing.push(`${key} (${range})`);
    else if (fromLock.get(key) !== range) mismatched.push(`${key}: package.json=${range} / lockfile=${fromLock.get(key)}`);
  }
  for (const [key, range] of fromLock) {
    if (!fromPkg.has(key)) ghost.push(`${key} (${range})`);
  }

  if (missing.length === 0 && ghost.length === 0 && mismatched.length === 0) {
    console.log(`✅ ${label} — ${fromPkg.size} 件の宣言が一致`);
    continue;
  }

  failed = true;
  console.error(`❌ ${label}`);
  for (const m of missing) {
    console.error(`   [lockfile に不足] ${m}`);
    annotate(lock, `${label}: lockfile に不足 — ${m}`);
  }
  for (const g of ghost) {
    console.error(`   [lockfile に幽霊宣言] ${g}`);
    annotate(lock, `${label}: package.json から消えた宣言が lockfile に残存 — ${g}`);
  }
  for (const d of mismatched) {
    console.error(`   [semver 範囲の不一致] ${d}`);
    annotate(lock, `${label}: semver 範囲が不一致 — ${d}`);
  }
}

if (failed) {
  console.error('');
  console.error('lockfile が package.json と同期していません。');
  console.error('該当ディレクトリで以下を実行して lockfile を更新してください:');
  console.error('  npm install --package-lock-only');
  process.exit(1);
}

console.log('');
console.log('全ての lockfile が package.json と同期しています。');
