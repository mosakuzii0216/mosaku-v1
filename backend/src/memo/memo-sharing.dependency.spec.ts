import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 公開読み取り経路の一方向 DI を守るアーキテクチャ・フィットネステスト（Req 3）。
 *
 * 公開読み取り経路（PublicMemoController → MemoSharingService）が編集系サービス
 * （MemoService）へ逆流依存しないことを CI で恒久的に検証する。逆流が混入すると将来の
 * サービス2分割コストが跳ね上がるため、import の継ぎ目をここで固定する。
 */
describe('公開読み取り経路の一方向 DI（Req 3）', () => {
	const readSource = (file: string): string => readFileSync(join(__dirname, file), 'utf-8');

	// 編集系サービス（./memo.service）への import を検出する。
	// './memo-sharing.service' は `memo\.service` に一致しないため誤検出しない。
	const EDIT_SERVICE_IMPORT = /from\s+['"]\.\/memo\.service['"]/;

	it('MemoSharingService が編集系 MemoService を import しないこと', () => {
		const source = readSource('memo-sharing.service.ts');

		expect(source).not.toMatch(EDIT_SERVICE_IMPORT);
	});

	it('PublicMemoController が編集系 MemoService を import しないこと', () => {
		const source = readSource('public-memo.controller.ts');

		expect(source).not.toMatch(EDIT_SERVICE_IMPORT);
		// 公開経路は MemoSharingService のみを依存に取る
		expect(source).toContain('MemoSharingService');
	});
});
