import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotebookService } from '../notebook/notebook.service';
import { MemoService } from '../memo/memo.service';

export interface OnboardingResult {
	notebookId: string;
	memoIds: string[];
}

const SAMPLE_MEMO_CONTENT = [
	{
		title: 'mosaku へようこそ 🎉',
		content: JSON.stringify({
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'mosaku へようこそ 🎉' }],
				},
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'mosaku は、美しいテーマと使いやすいエディタで思考を整えるメモアプリです。',
						},
					],
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: '✨ こんなことができます' }],
				},
				{
					type: 'taskList',
					content: [
						{
							type: 'taskItem',
							attrs: { checked: true },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: 'テーマを選んで世界観をカスタマイズ' }],
								},
							],
						},
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: 'ノートブックでメモを整理する' }],
								},
							],
						},
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: 'タグでメモを横断検索する' }],
								},
							],
						},
					],
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: '⚡ スラッシュコマンドを使ってみよう' }],
				},
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: '本文中で ',
						},
						{
							type: 'text',
							marks: [{ type: 'code' }],
							text: '/',
						},
						{
							type: 'text',
							text: ' を入力するとコマンドメニューが開きます。見出し・コードブロック・チェックリストをすばやく挿入できます。',
						},
					],
				},
				{
					type: 'codeBlock',
					attrs: { language: 'markdown' },
					content: [
						{
							type: 'text',
							text: '/ → コマンドメニューを開く\n/h1 → 見出し1\n/code → コードブロック\n/task → チェックリスト',
						},
					],
				},
			],
		}),
	},
	{
		title: '今日やること',
		content: JSON.stringify({
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: '今日やること 📋' }],
				},
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'チェックリストで今日のタスクを管理しましょう。完了したらチェックを入れるだけ！',
						},
					],
				},
				{
					type: 'taskList',
					content: [
						{
							type: 'taskItem',
							attrs: { checked: true },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: 'mosaku に登録する' }],
								},
							],
						},
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: '好きなテーマを選ぶ' }],
								},
							],
						},
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: '最初のメモを書いてみる' }],
								},
							],
						},
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: 'ノートブックを作って整理する' }],
								},
							],
						},
					],
				},
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [{ type: 'text', text: 'メモのコツ 💡' }],
				},
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: '完璧な文章を書こうとしなくて大丈夫。まず書き出すことが大事です。',
						},
					],
				},
				{
					type: 'codeBlock',
					attrs: { language: 'text' },
					content: [
						{
							type: 'text',
							text: '思いついたことをそのまま書く\n→ あとで整理する\n→ タグやノートブックで分類する',
						},
					],
				},
			],
		}),
	},
] as const;

@Injectable()
export class OnboardingService {
	constructor(
		private readonly prisma: PrismaService,
		// DI for future non-transactional use; transaction uses tx client directly
		private readonly notebookService: NotebookService,
		private readonly memoService: MemoService,
	) {}

	async complete(userId: string, themeId: string): Promise<OnboardingResult> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } });
		if (user?.onboardingCompleted) {
			return { notebookId: '', memoIds: [] };
		}

		return this.prisma.$transaction(async (tx) => {
			const notebook = await tx.notebook.create({
				data: {
					name: 'ようこそ',
					user: { connect: { id: userId } },
					theme: { connect: { id: themeId } },
				},
			});

			const [memo1, memo2] = await Promise.all([
				tx.memo.create({
					data: {
						title: SAMPLE_MEMO_CONTENT[0].title,
						content: SAMPLE_MEMO_CONTENT[0].content,
						userId,
						notebookId: notebook.id,
					},
				}),
				tx.memo.create({
					data: {
						title: SAMPLE_MEMO_CONTENT[1].title,
						content: SAMPLE_MEMO_CONTENT[1].content,
						userId,
						notebookId: notebook.id,
					},
				}),
			]);

			await tx.user.update({
				where: { id: userId },
				data: { onboardingCompleted: true },
			});

			return { notebookId: notebook.id, memoIds: [memo1.id, memo2.id] };
		});
	}

	async skip(userId: string): Promise<void> {
		await this.prisma.user.update({
			where: { id: userId },
			data: { onboardingCompleted: true },
		});
	}
}
