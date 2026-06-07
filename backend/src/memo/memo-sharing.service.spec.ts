import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { MemoSharingService } from './memo-sharing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';

jest.mock('@sentry/nestjs', () => ({
	captureMessage: jest.fn(),
	captureException: jest.fn(),
}));

const mockMemo = (overrides: Record<string, unknown> = {}) => ({
	id: 'memo-1',
	title: 'Test Memo',
	content: 'Content',
	createdAt: new Date('2026-05-01T00:00:00.000Z'),
	updatedAt: new Date('2026-05-10T00:00:00.000Z'),
	trashedAt: null,
	userId: 'user-1',
	notebookId: null,
	publicToken: null as string | null,
	publishedAt: null as Date | null,
	...overrides,
});

const mockPrismaService = {
	memo: {
		findFirst: jest.fn(),
		findMany: jest.fn(),
		update: jest.fn(),
	},
};

describe('MemoSharingService', () => {
	let service: MemoSharingService;
	const captureMessageMock = Sentry.captureMessage as jest.Mock;
	const captureExceptionMock = Sentry.captureException as jest.Mock;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MemoSharingService,
				{ provide: PrismaService, useValue: mockPrismaService },
				AuthorizationService,
			],
		}).compile();

		service = module.get<MemoSharingService>(MemoSharingService);
		jest.clearAllMocks();
	});

	// ─── 2.1 token generation ───────────────────────────────────────────

	describe('token generation (publishMemo経由)', () => {
		it('生成されるトークンは URL セーフな base64url 文字列で十分なエントロピーを持つ', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo());
			let savedToken = '';
			mockPrismaService.memo.update.mockImplementation(async ({ data }) => {
				savedToken = data.publicToken as string;
				return {
					id: 'memo-1',
					publicToken: savedToken,
					publishedAt: new Date(),
				};
			});

			await service.publishMemo('memo-1', 'user-1');

			expect(savedToken).toMatch(/^[A-Za-z0-9_-]+$/);
			// 32バイト → base64url 43文字（パディングなし）
			expect(savedToken.length).toBeGreaterThanOrEqual(43);
		});

		it('生成されるトークンには memoId / userId が平文で含まれない', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ id: 'memo-secret-id', userId: 'user-secret-id' }),
			);
			let savedToken = '';
			mockPrismaService.memo.update.mockImplementation(async ({ data }) => {
				savedToken = data.publicToken as string;
				return {
					id: 'memo-secret-id',
					publicToken: savedToken,
					publishedAt: new Date(),
				};
			});

			await service.publishMemo('memo-secret-id', 'user-secret-id');

			expect(savedToken).not.toContain('memo-secret-id');
			expect(savedToken).not.toContain('user-secret-id');
		});

		it('UNIQUE 制約違反（P2002）を捕捉して最大 5 回再生成リトライする', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo());
			const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
				code: 'P2002',
				clientVersion: 'test',
				meta: { target: ['public_token'] },
			});

			let calls = 0;
			mockPrismaService.memo.update.mockImplementation(async ({ data }) => {
				calls++;
				if (calls < 3) {
					throw p2002;
				}
				return {
					id: 'memo-1',
					publicToken: data.publicToken,
					publishedAt: new Date(),
				};
			});

			const result = await service.publishMemo('memo-1', 'user-1');

			expect(calls).toBe(3);
			expect(result.publicToken).toBeTruthy();
		});

		it('5 回連続で衝突した場合は例外を投げ Sentry に送出する', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo());
			const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
				code: 'P2002',
				clientVersion: 'test',
				meta: { target: ['public_token'] },
			});
			mockPrismaService.memo.update.mockRejectedValue(p2002);

			await expect(service.publishMemo('memo-1', 'user-1')).rejects.toThrow();
			expect(mockPrismaService.memo.update).toHaveBeenCalledTimes(5);
			expect(captureExceptionMock).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({
					tags: expect.objectContaining({ feature_area: 'memo' }),
				}),
			);
		});

		it('P2002 以外のエラーは即座に再スローされリトライしない', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo());
			const otherError = new Error('connection lost');
			mockPrismaService.memo.update.mockRejectedValue(otherError);

			await expect(service.publishMemo('memo-1', 'user-1')).rejects.toThrow('connection lost');
			expect(mockPrismaService.memo.update).toHaveBeenCalledTimes(1);
		});
	});

	// ─── 2.2 publish / unpublish ────────────────────────────────────────

	describe('publishMemo()', () => {
		it('所有者が公開操作するとトークンと publishedAt が保存される', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo());
			const publishedAt = new Date('2026-05-30T10:00:00.000Z');
			mockPrismaService.memo.update.mockImplementation(async ({ data }) => ({
				id: 'memo-1',
				publicToken: data.publicToken,
				publishedAt,
			}));

			const result = await service.publishMemo('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: expect.objectContaining({
						publicToken: expect.any(String),
						publishedAt: expect.any(Date),
					}),
				}),
			);
			expect(result.memoId).toBe('memo-1');
			expect(result.publicToken).toBeTruthy();
			expect(result.publishedAt).toEqual(publishedAt);
		});

		it('所有者以外が公開操作すると 403 を返す', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo({ userId: 'other-user' }));

			await expect(service.publishMemo('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});

		it('ゴミ箱内メモを公開しようとすると 404 を返す（Requirements 1.5）', async () => {
			// trashedAt: null フィルタで findFirst が null を返す
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.publishMemo('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});
	});

	describe('unpublishMemo()', () => {
		it('所有者が非公開操作すると publicToken / publishedAt が NULL に戻る', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ publicToken: 'token-abc', publishedAt: new Date() }),
			);
			mockPrismaService.memo.update.mockResolvedValue({});

			await service.unpublishMemo('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { publicToken: null, publishedAt: null },
				}),
			);
		});

		it('既に非公開のメモへの非公開操作は no-op で update を呼ばない', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ publicToken: null, publishedAt: null }),
			);

			await service.unpublishMemo('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});

		it('所有者以外が非公開操作すると 403 を返す', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ userId: 'other-user', publicToken: 'token-abc' }),
			);

			await expect(service.unpublishMemo('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});

		it('ゴミ箱内メモへの非公開操作は 404 を返す', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.unpublishMemo('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});
	});

	describe('unpublishIfPublished()', () => {
		it('公開中メモがあれば cascade-trash として非公開化する', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ publicToken: 'token-abc', publishedAt: new Date() }),
			);
			mockPrismaService.memo.update.mockResolvedValue({});

			await service.unpublishIfPublished('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'memo-1' },
					data: { publicToken: null, publishedAt: null },
				}),
			);
			expect(captureMessageMock).toHaveBeenCalledWith(
				'memo_public_unpublished',
				expect.objectContaining({
					level: 'info',
					tags: expect.objectContaining({ feature_area: 'memo' }),
					extra: expect.objectContaining({ memoId: 'memo-1', reason: 'cascade-trash' }),
				}),
			);
		});

		it('既に非公開なら no-op で update / Sentry を呼ばない', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ publicToken: null, publishedAt: null }),
			);

			await service.unpublishIfPublished('memo-1', 'user-1');

			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
			expect(captureMessageMock).not.toHaveBeenCalled();
		});

		it('メモが存在しなくても例外を投げずに no-op となる', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.unpublishIfPublished('memo-1', 'user-1')).resolves.toBeUndefined();
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});
	});

	// ─── 2.3 regenerateToken ────────────────────────────────────────────

	describe('regenerateToken()', () => {
		it('旧トークンを無効化し新トークンと publishedAt を保存する', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({
					publicToken: 'old-token',
					publishedAt: new Date('2026-05-01T00:00:00.000Z'),
				}),
			);
			const newPublishedAt = new Date('2026-05-30T11:00:00.000Z');
			mockPrismaService.memo.update.mockImplementation(({ data }) => ({
				id: 'memo-1',
				publicToken: data.publicToken,
				publishedAt: newPublishedAt,
			}));

			const result = await service.regenerateToken('memo-1', 'user-1');

			expect(result.publicToken).not.toBe('old-token');
			expect(result.publicToken).toBeTruthy();
			expect(result.publishedAt).toEqual(newPublishedAt);
		});

		it('非公開メモへの再生成は 404 を返す', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ publicToken: null, publishedAt: null }),
			);

			await expect(service.regenerateToken('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
			expect(mockPrismaService.memo.update).not.toHaveBeenCalled();
		});

		it('所有者以外が再生成すると 403 を返す', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ userId: 'other-user', publicToken: 'token-abc' }),
			);

			await expect(service.regenerateToken('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});

		it('ゴミ箱内メモへの再生成は 404 を返す', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.regenerateToken('memo-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});
	});

	// ─── 2.4 listMyPublicMemos ──────────────────────────────────────────

	describe('listMyPublicMemos()', () => {
		it('自分が公開中のメモを publishedAt 降順で返す', async () => {
			const memos = [
				{
					id: 'memo-2',
					title: 'Memo 2',
					publicToken: 'tok2',
					publishedAt: new Date('2026-05-30T10:00:00.000Z'),
					updatedAt: new Date('2026-05-30T10:00:00.000Z'),
				},
				{
					id: 'memo-1',
					title: 'Memo 1',
					publicToken: 'tok1',
					publishedAt: new Date('2026-05-29T10:00:00.000Z'),
					updatedAt: new Date('2026-05-29T10:00:00.000Z'),
				},
			];
			mockPrismaService.memo.findMany.mockResolvedValue(memos);

			const result = await service.listMyPublicMemos('user-1');

			expect(mockPrismaService.memo.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						userId: 'user-1',
						trashedAt: null,
						publicToken: { not: null },
					}),
					orderBy: { publishedAt: 'desc' },
				}),
			);
			expect(result).toHaveLength(2);
			expect(result[0].memoId).toBe('memo-2');
			expect(result[0].publicToken).toBe('tok2');
			expect(result[0].title).toBe('Memo 2');
		});

		it('レスポンスに個人情報（userId / email）を含まない', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([
				{
					id: 'memo-1',
					title: 'Memo 1',
					publicToken: 'tok1',
					publishedAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			const result = await service.listMyPublicMemos('user-1');

			expect(result[0]).not.toHaveProperty('userId');
			expect(result[0]).not.toHaveProperty('email');
			expect(result[0]).not.toHaveProperty('notebookId');
			expect(Object.keys(result[0]).sort()).toEqual(
				['memoId', 'publicToken', 'publishedAt', 'title', 'updatedAt'].sort(),
			);
		});

		it('selectで title/publicToken/publishedAt/updatedAt のみを取得する', async () => {
			mockPrismaService.memo.findMany.mockResolvedValue([]);

			await service.listMyPublicMemos('user-1');

			const [[args]] = mockPrismaService.memo.findMany.mock.calls as Array<
				[{ select: Record<string, boolean> }]
			>;
			expect(args.select).toEqual({
				id: true,
				title: true,
				publicToken: true,
				publishedAt: true,
				updatedAt: true,
			});
		});
	});

	// ─── 2.5 findByToken ────────────────────────────────────────────────

	describe('findByToken()', () => {
		it('公開中メモから title / content / updatedAt のみを返す', async () => {
			const updatedAt = new Date('2026-05-30T12:00:00.000Z');
			mockPrismaService.memo.findFirst.mockResolvedValue({
				title: 'Public Memo',
				content: '<p>hello</p>',
				updatedAt,
			});

			const result = await service.findByToken('token-abc');

			expect(mockPrismaService.memo.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { publicToken: 'token-abc', trashedAt: null },
					select: { title: true, content: true, updatedAt: true },
				}),
			);
			expect(result).toEqual({
				title: 'Public Memo',
				content: '<p>hello</p>',
				updatedAt,
			});
		});

		it('レスポンスに個人情報（userId / email / notebookId）を含まない', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue({
				title: 'Public Memo',
				content: '<p>hello</p>',
				updatedAt: new Date(),
			});

			const result = await service.findByToken('token-abc');

			expect(result).not.toHaveProperty('userId');
			expect(result).not.toHaveProperty('email');
			expect(result).not.toHaveProperty('notebookId');
			expect(Object.keys(result).sort()).toEqual(['content', 'title', 'updatedAt']);
		});

		it('存在しないトークンは 404 を返す', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.findByToken('nonexistent')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('非公開化された（publicToken を剥奪された）メモの旧トークンは 404 を返す', async () => {
			// 非公開化で publicToken=null になったメモは where: { publicToken } に一致せず null が返る
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.findByToken('revoked-token')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});

			const [[args]] = mockPrismaService.memo.findFirst.mock.calls as Array<
				[{ where: { publicToken: string } }]
			>;
			expect(args.where.publicToken).toBe('revoked-token');
		});

		it('ゴミ箱内メモのトークンは 404 を返す（findFirst の trashedAt: null フィルタで除外）', async () => {
			// findFirst が null を返すケース（クエリ自体がゴミ箱内を除外する）
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.findByToken('trashed-token')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});

			const [[args]] = mockPrismaService.memo.findFirst.mock.calls as Array<
				[{ where: { trashedAt: null } }]
			>;
			expect(args.where.trashedAt).toBeNull();
		});
	});

	// ─── 3.1 データ境界回帰（存在秘匿・フィールド非露出） ───────────────
	// memo-public-isolation Task 3.1 / Req 4.1-4.3。
	// findByToken の where 条件 (publicToken 一致 + trashedAt null) により、未公開・
	// ゴミ箱（soft delete）・無効トークンはいずれも findFirst が null となり、区別
	// 不能な同一 404 として秘匿される。返却 shape は公開3フィールドに限定される。

	describe('データ境界回帰 (Task 3.1)', () => {
		it.each([
			['未公開（publicToken 未設定）のメモ', 'unpublished-token-123456'],
			['ゴミ箱（soft delete, trashedAt non-null）のメモ', 'trashed-token-1234567890'],
			['存在しない無効トークン', 'invalid-token-1234567890'],
		])('%s は 404（NotFoundException）として秘匿される', async (_label, token) => {
			// where 条件に合致しないため Prisma は null を返す
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			await expect(service.findByToken(token)).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('未公開・ゴミ箱・無効トークンの 404 応答が同一で、どのケースかを判別させない（存在秘匿）', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(null);

			const responses: unknown[] = [];
			for (const token of ['unpublished', 'trashed', 'nonexistent']) {
				const error = await service.findByToken(token).catch((e: HttpException) => ({
					status: e.getStatus(),
					body: e.getResponse(),
				}));
				responses.push(error);
			}

			// 3 ケースとも区別不能な同一応答であること（ケース別の情報を漏らさない）
			expect(responses[0]).toEqual(responses[1]);
			expect(responses[1]).toEqual(responses[2]);
		});

		it('返却 shape に内部 ID・所有者識別・編集系フィールドを含めない（Req 4.3）', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue({
				title: 'Public Title',
				content: '<p>body</p>',
				updatedAt: new Date('2026-05-30T12:00:00.000Z'),
			});

			const result = await service.findByToken('valid-token-1234567890');

			for (const leaked of [
				'id',
				'userId',
				'ownerId',
				'publicToken',
				'publishedAt',
				'trashedAt',
				'createdAt',
				'notebookId',
			]) {
				expect(result).not.toHaveProperty(leaked);
			}
			expect(Object.keys(result).sort()).toEqual(['content', 'title', 'updatedAt']);

			// 露出制御の源泉である select が公開3フィールドに限定されていること
			const [[args]] = mockPrismaService.memo.findFirst.mock.calls as Array<
				[{ select: Record<string, boolean> }]
			>;
			expect(args.select).toEqual({ title: true, content: true, updatedAt: true });
		});
	});

	// ─── 2.6 Audit logging ──────────────────────────────────────────────

	describe('audit logging (Sentry captureMessage)', () => {
		it('publishMemo 成功時に memo_public_published を feature_area:memo で送る', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo());
			mockPrismaService.memo.update.mockResolvedValue({
				id: 'memo-1',
				publicToken: 'tok',
				publishedAt: new Date(),
			});

			await service.publishMemo('memo-1', 'user-1');

			expect(captureMessageMock).toHaveBeenCalledWith(
				'memo_public_published',
				expect.objectContaining({
					level: 'info',
					tags: expect.objectContaining({ feature_area: 'memo' }),
					extra: expect.objectContaining({ memoId: 'memo-1' }),
				}),
			);
		});

		it('unpublishMemo 成功時に memo_public_unpublished を reason:manual で送る', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(mockMemo({ publicToken: 'token-abc' }));
			mockPrismaService.memo.update.mockResolvedValue({});

			await service.unpublishMemo('memo-1', 'user-1');

			expect(captureMessageMock).toHaveBeenCalledWith(
				'memo_public_unpublished',
				expect.objectContaining({
					level: 'info',
					tags: expect.objectContaining({ feature_area: 'memo' }),
					extra: expect.objectContaining({ memoId: 'memo-1', reason: 'manual' }),
				}),
			);
		});

		it('regenerateToken 成功時に memo_public_token_regenerated を送る', async () => {
			mockPrismaService.memo.findFirst.mockResolvedValue(
				mockMemo({ publicToken: 'old', publishedAt: new Date() }),
			);
			mockPrismaService.memo.update.mockResolvedValue({
				id: 'memo-1',
				publicToken: 'new',
				publishedAt: new Date(),
			});

			await service.regenerateToken('memo-1', 'user-1');

			expect(captureMessageMock).toHaveBeenCalledWith(
				'memo_public_token_regenerated',
				expect.objectContaining({
					level: 'info',
					tags: expect.objectContaining({ feature_area: 'memo' }),
					extra: expect.objectContaining({ memoId: 'memo-1' }),
				}),
			);
		});
	});
});
