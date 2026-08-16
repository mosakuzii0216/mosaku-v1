/**
 * Task 3: データモデルの非破壊保持と識別子の健全性文書化
 *
 * - `lineId` 列とデータを破壊的マイグレーションで削除せず保持する（要件5.1, 5.2）
 * - `githubId` 専用列が存在せず GitHub が `oauthId` を Google と共用していること、
 *   撤去が Google に無影響であることをスキーマ上に文書化する（要件4.1, 4.2）
 * - 残プロバイダ（oauthId / appleId / xId）の一意制約が無変更で維持される（要件4.3）
 *
 * マイグレーションは生成しない（design.md「Migration Strategy」）。本テストは
 * schema.prisma のソースをそのまま検証するフィットネステスト。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Prisma } from '@prisma/client';

describe('User モデル OAuth 識別子カラムの非破壊保持（Req 4.1, 4.2, 4.3, 5.1, 5.2）', () => {
	const schemaSource = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf-8');
	const userModelSource = (() => {
		const match = schemaSource.match(/model User \{[\s\S]*?\n\}/);
		if (!match) throw new Error('schema.prisma に model User が見つかりません');
		return match[0];
	})();
	const userModelLines = userModelSource.split('\n');
	const linesBefore = (needle: string, count: number): string => {
		const idx = userModelLines.findIndex((line) => line.includes(needle));
		expect(idx).toBeGreaterThan(-1);
		return userModelLines.slice(Math.max(0, idx - count), idx).join('\n');
	};

	it('lineId 列を @unique 付きで保持する（Req 5.1: 破壊的マイグレーションで削除しない）', () => {
		expect(userModelSource).toMatch(/lineId\s+String\?\s+@unique\s+@map\("line_id"\)/);
	});

	it('lineId 列の直前に LINE 廃止後も列を保持する理由のコメントがある（Req 5.2）', () => {
		const preceding = linesBefore('lineId', 3);
		expect(preceding).toMatch(/LINE/);
		expect(preceding).toMatch(/保持/);
	});

	it('githubId 専用列が存在しない（Req 4.1: GitHub は判別列を持たない）', () => {
		expect(userModelSource).not.toMatch(/githubId/);
	});

	it('oauthId 列の直前に GitHub が共用していた旨の文書コメントがある（Req 4.1, 4.2）', () => {
		const preceding = linesBefore('oauthId', 3);
		expect(preceding).toMatch(/GitHub/);
		expect(preceding).toMatch(/共用/);
	});

	it('残プロバイダ（oauthId / appleId / xId）の一意制約が無変更で維持されている（Req 4.3）', () => {
		expect(userModelSource).toMatch(/oauthId\s+String\?\s+@unique\s+@map\("oauth_id"\)/);
		expect(userModelSource).toMatch(/appleId\s+String\?\s+@unique\s+@map\("apple_id"\)/);
		expect(userModelSource).toMatch(/xId\s+String\?\s+@unique\s+@map\("x_id"\)/);
	});

	it('Prisma のランタイム型が lineId を任意フィールドとして受理する（非破壊の型レベル確認）', () => {
		const input: Prisma.UserUncheckedCreateInput = {
			id: 'user-legacy-line',
			email: 'legacy-line-user@example.com',
			lineId: 'line-legacy-id',
		};

		expect(input.lineId).toBe('line-legacy-id');
	});
});
