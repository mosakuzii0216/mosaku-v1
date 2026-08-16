import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * フロント不変則の固定スペック（Task 6.2 / Req 6.1 / 6.2）。
 *
 * 公開メモ取得を含む API コールが `apiClient` 経由を維持し直接 `fetch` を新設しないこと、サーバー状態の
 * 真実の源泉が React Query に保たれ公開メモデータを Zustand へコピーしないことを CI で恒久的に固定する。
 * いずれかが破られると RED になる。
 */
const SRC_ROOT = join(__dirname, '..', '..');

const readSrc = (relPath: string): string => readFileSync(join(SRC_ROOT, relPath), 'utf8');

// 公開メモ機能（未ログイン閲覧 + 所有者の公開操作）を構成するフロント資産。
// 新たな公開メモ系コンポーネント/フックを追加したらここへ追記し、不変則の検証対象に含めること。
const PUBLIC_MEMO_FILES = [
	'hooks/useMemoSharingQueries.ts',
	'components/public/PublicMemoPage.tsx',
	'components/public/PublicMemoView.tsx',
	'components/public/PublicMemoRenderer.tsx',
	'components/settings/PublicMemosCard.tsx',
] as const;

describe('公開メモ機能のフロント不変則の固定（Task 6.2）', () => {
	describe('全 API コールが apiClient 経由で、直接 fetch を新設しないこと（Req 6.1）', () => {
		it('検出器の健全性: 直接 fetch 呼び出しを検出できること（RED 前提の固定）', () => {
			const directFetch = /(?<![.\w])fetch\s*\(/;
			expect(directFetch.test('const r = await fetch(url)')).toBe(true);
			// apiClient のメソッド経由（this.fetch 等）や別語は誤検出しない
			expect(directFetch.test('apiClient.getPublicMemo(token)')).toBe(false);
			expect(directFetch.test('await this.fetchJson(url)')).toBe(false);
		});

		it.each(PUBLIC_MEMO_FILES)('%s が直接 fetch( を呼ばないこと', (file) => {
			const source = readSrc(file);

			expect(/(?<![.\w])fetch\s*\(/.test(source)).toBe(false);
		});

		it('公開メモのデータ取得フックが apiClient を経由すること', () => {
			const source = readSrc('hooks/useMemoSharingQueries.ts');

			expect(source).toMatch(/from\s+['"][./]*utils\/api['"]/);
			expect(source).toContain('apiClient.getPublicMemo');
			expect(source).toContain('apiClient.getMyPublicMemos');
		});
	});

	describe('サーバー状態の真実の源泉を React Query に維持し Zustand へコピーしないこと（Req 6.2）', () => {
		it('公開メモのデータ取得フックが React Query（useQuery）を真実の源泉とすること', () => {
			const source = readSrc('hooks/useMemoSharingQueries.ts');

			expect(source).toMatch(/from\s+['"]@tanstack\/react-query['"]/);
			expect(source).toContain('useQuery');
		});

		it.each(PUBLIC_MEMO_FILES)('%s が公開メモデータを Zustand ストアへコピーしないこと', (file) => {
			const source = readSrc(file);

			// 公開メモ経路から zustand ストア（src/stores/*）への依存を持たないことを固定する。
			expect(/from\s+['"][./]*stores\//.test(source)).toBe(false);
			expect(source).not.toContain('zustand');
		});
	});
});
