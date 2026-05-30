import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 公開読み取り経路の一方向 DI を守るアーキテクチャ・フィットネステスト（Req 3）。
 *
 * 公開読み取り経路（PublicMemoController → MemoSharingService、および公開専用の横断観測
 * Interceptor）が編集系サービス（MemoService）へ逆流依存しないことを CI で恒久的に検証する。
 * 逆流が混入すると将来のサービス2分割コストが跳ね上がるため、import の継ぎ目をここで固定する。
 *
 * このスペックは jest（`npm run test` / CI の `test:cov`）の対象に含まれ、正式な品質ゲートとして
 * 常時実行される。逆方向依存が一時的にでも追加されると RED になることを設計前提として維持する。
 */
describe('公開読み取り経路の一方向 DI（Req 3）', () => {
	const readSource = (file: string): string => readFileSync(join(__dirname, file), 'utf-8');

	// 編集系サービス（./memo.service）への import を検出する単一ソースの判定器。
	// './memo-sharing.service' は `memo\.service` の前に `-sharing` が挟まるため一致しない（誤検出しない）。
	const importsEditService = (source: string): boolean =>
		/from\s+['"]\.\/memo\.service['"]/.test(source);

	// 公開読み取り経路を構成する全ソース。新たな公開専用コンポーネントを追加したら
	// 必ずここへ追記し、一方向 DI の検証対象に含めること。
	const PUBLIC_READ_PATH_FILES = [
		'memo-sharing.service.ts',
		'public-memo.controller.ts',
		'public-read-observability.interceptor.ts',
	] as const;

	describe('逆流検出器の健全性（RED 前提の固定）', () => {
		it('編集系サービスへの逆流 import を検出できること', () => {
			const reverseImport = "import { MemoService } from './memo.service';";

			expect(importsEditService(reverseImport)).toBe(true);
		});

		it('共有サービス（./memo-sharing.service）の import を編集系と誤検出しないこと', () => {
			const sharingImport = "import { MemoSharingService } from './memo-sharing.service';";

			expect(importsEditService(sharingImport)).toBe(false);
		});
	});

	describe('公開読み取り経路が編集系 MemoService を import しないこと', () => {
		it.each(PUBLIC_READ_PATH_FILES)('%s が編集系 MemoService を import しないこと', (file) => {
			const source = readSource(file);

			expect(importsEditService(source)).toBe(false);
		});
	});

	it('PublicMemoController は公開経路の MemoSharingService のみを依存に取ること', () => {
		const source = readSource('public-memo.controller.ts');

		expect(source).toContain('MemoSharingService');
		expect(importsEditService(source)).toBe(false);
	});

	it('公開専用 Interceptor は下位共通レイヤー（common/sentry）のみを共有し編集系へ依存しないこと', () => {
		const source = readSource('public-read-observability.interceptor.ts');

		// 共通で必要な route 正規化は双方が依存可能な下位共通レイヤーに置く（Req 3.3）。
		expect(source).toMatch(/from\s+['"]\.\.\/common\/sentry\/sentry-tags['"]/);
		// 編集系サービス経由の間接依存を作らない（Req 3.3）。
		expect(importsEditService(source)).toBe(false);
	});
});
