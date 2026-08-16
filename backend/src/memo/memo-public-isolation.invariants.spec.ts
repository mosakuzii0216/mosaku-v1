import { readFileSync } from 'fs';
import { join } from 'path';
import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
	applyStandardTags,
	PUBLIC_MEMO_NORMALIZED_PATH,
	resolveFeatureArea,
} from '../common/sentry/sentry-tags';
import { PublicReadObservabilityInterceptor } from './public-read-observability.interceptor';
import { MemoEditObservabilityInterceptor } from './memo-edit-observability.interceptor';

/**
 * 既存アーキテクチャ不変則の維持を固定するスペック（Task 6.1 / Req 1.2 / 1.4 / 1.5 / 6.3）。
 *
 * 本フェーズの観測追加（公開/編集の薄い Interceptor）が、(a) 5 タグ契約と feature_area enum を
 * 既存定義から逸脱させないこと、(b) 公開読み取りトレースのサンプリング率をコード側で書き換えない
 * ことを CI で恒久的に固定する。いずれかが破られると RED になる。
 */
describe('memo-public-isolation 既存不変則の固定（Task 6.1）', () => {
	// 5 タグ契約（Req 1.5）。environment / release は instrument.ts の Sentry.init オプション由来、
	// feature_area / route / user_facing は applyStandardTags 由来。この 5 つで 1 つも欠かさないのが契約。
	const FIVE_TAG_CONTRACT = [
		'environment',
		'release',
		'feature_area',
		'route',
		'user_facing',
	] as const;

	// feature_area enum の正準集合（Req 6.3）。公開/編集は feature_area ではなく route で区別する（Req 1.2）。
	// 'mcp' は MCP エンドポイント（/mcp, /oauth, /.well-known/oauth）の feature_area として追加（mcp-endpoint spec）。
	const CANONICAL_FEATURE_AREAS = [
		'memo',
		'notebook',
		'tag',
		'theme',
		'auth',
		'invitation',
		'dashboard',
		'system',
		'mcp',
		'unknown',
	] as const;

	const readBackendSource = (relPath: string): string =>
		readFileSync(join(__dirname, relPath), 'utf-8');

	describe('5 タグ契約と feature_area enum が既存定義から逸脱しないこと（Req 1.2 / 6.3）', () => {
		it('FeatureArea 型の union メンバーが正準集合と完全一致すること（enum 逸脱の固定）', () => {
			const source = readFileSync(join(__dirname, '../common/sentry/sentry-tags.ts'), 'utf-8');
			const match = source.match(/export type FeatureArea =([\s\S]*?);/);
			expect(match).not.toBeNull();

			const declaredMembers = Array.from(match![1].matchAll(/'([a-z]+)'/g)).map((m) => m[1]);

			expect(new Set(declaredMembers)).toEqual(new Set(CANONICAL_FEATURE_AREAS));
		});

		it('公開読み取り経路の feature_area は memo に固定され、区別は route が担うこと（Req 1.2）', () => {
			expect(resolveFeatureArea(PUBLIC_MEMO_NORMALIZED_PATH)).toBe('memo');
			expect(CANONICAL_FEATURE_AREAS).toContain('memo');
		});

		it('applyStandardTags が公開 route で feature_area / route / user_facing を 1 つも欠かさず付与すること', () => {
			const tagged = applyStandardTags({
				request: { url: `${PUBLIC_MEMO_NORMALIZED_PATH}` },
				contexts: { response: { status_code: 200 } },
			});

			expect(tagged.tags.feature_area).toBe('memo');
			expect(tagged.tags.route).toBe(PUBLIC_MEMO_NORMALIZED_PATH);
			expect(typeof tagged.tags.user_facing).toBe('boolean');
		});

		it('5 タグ契約の集合が environment / release / feature_area / route / user_facing で固定であること', () => {
			// 契約のキー集合そのものを固定。将来タグ契約を変える場合はここを意図的に更新する必要がある。
			expect([...FIVE_TAG_CONTRACT].sort()).toEqual(
				['environment', 'feature_area', 'release', 'route', 'user_facing'].sort(),
			);
		});

		it('公開側・編集側 Interceptor がともに feature_area=memo のみを発出し、正準集合内に収まること（Req 1.2）', async () => {
			const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
			try {
				const context = {
					switchToHttp: () => ({
						getRequest: () => ({ method: 'GET', url: PUBLIC_MEMO_NORMALIZED_PATH }),
						getResponse: () => ({ statusCode: 200 }),
					}),
				} as unknown as ExecutionContext;
				const handler = { handle: () => of({ ok: true }) };

				await lastValueFrom(new PublicReadObservabilityInterceptor().intercept(context, handler));
				await lastValueFrom(new MemoEditObservabilityInterceptor().intercept(context, handler));

				const emitted = logSpy.mock.calls.map(
					([line]) => JSON.parse(line as string) as { feature_area: string },
				);
				expect(emitted).toHaveLength(2);
				for (const payload of emitted) {
					expect(payload.feature_area).toBe('memo');
					expect(CANONICAL_FEATURE_AREAS).toContain(payload.feature_area as never);
				}
			} finally {
				logSpy.mockRestore();
			}
		});
	});

	describe('公開読み取りトレースのサンプリング率をコード側で変更しないこと（Req 1.4）', () => {
		// 本フェーズで追加した観測コードがサンプリング制御に触れていないことを固定する。
		const ISOLATION_OBSERVABILITY_FILES = [
			'public-read-observability.interceptor.ts',
			'memo-edit-observability.interceptor.ts',
			'public-memo.controller.ts',
		] as const;

		const SAMPLING_KNOBS = /tracesSampleRate|profilesSampleRate|sampleRate|Sentry\.init/;

		it('検出器の健全性: サンプリング制御の記述を検出できること（RED 前提の固定）', () => {
			expect(SAMPLING_KNOBS.test('tracesSampleRate: 0.5')).toBe(true);
			expect(SAMPLING_KNOBS.test('Sentry.init({})')).toBe(true);
			expect(SAMPLING_KNOBS.test('normalizeRoute(path)')).toBe(false);
		});

		it.each(ISOLATION_OBSERVABILITY_FILES)(
			'%s がサンプリング率制御（tracesSampleRate 等）や Sentry.init を含まないこと',
			(file) => {
				expect(SAMPLING_KNOBS.test(readBackendSource(file))).toBe(false);
			},
		);
	});

	describe('helmet・既存レート制限の方針を破壊しないこと（Task 6.2 / Req 6.4）', () => {
		it('公開コントローラが IP 60req/分のレート制限（@Throttle）を維持していること', () => {
			const source = readBackendSource('public-memo.controller.ts');

			// 既存レート制限（IP 60req/分）の方針を固定。ttl/limit を緩めると RED になる。
			expect(source).toMatch(
				/@Throttle\(\s*\{\s*default:\s*\{\s*ttl:\s*60_?000,\s*limit:\s*60\s*\}/,
			);
		});

		it('公開コントローラが @Public() opt-out と読み取り専用（GET のみ）の境界を維持していること（Req 4.4 / 4.5）', () => {
			const source = readBackendSource('public-memo.controller.ts');

			expect(source).toContain('@Public()');
			expect(source).toContain('@Get');
			// 公開経路に書き込み系メソッドを新設していないこと（読み取り専用境界の固定）
			expect(source).not.toMatch(/@(Post|Put|Patch|Delete)\(/);
		});

		it('main.ts が helmet セキュリティヘッダーを維持していること', () => {
			const mainSource = readFileSync(join(__dirname, '../main.ts'), 'utf-8');

			expect(mainSource).toContain('helmet');
			expect(mainSource).toMatch(/app\.use\(\s*[\s\S]*helmet\(/);
		});
	});
});
