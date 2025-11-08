import { useEffect, useMemo, useState } from 'react';
// import { TagSelector } from '../tag/TagSelector';
import { TagDropdownIcon } from '../tag/TagDropdownIcon';
import { RichTextEditor } from '../editor/RichTextEditor';
import { useCreateNotebook, useNotebook, useUpdateNotebook } from '../../hooks/useNotebookQueries';
import { useSystemThemes, usePublicThemes } from '../../hooks/useThemeQueries';
import { useMemoStore } from '../../stores/useMemoStore';
import { useTagStore } from '../../stores/useTagStore';

interface NotebookEditorProps {
	isCreate?: boolean;
	notebookId?: string;
}

export const NotebookEditor = ({ isCreate, notebookId }: NotebookEditorProps) => {
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const [content, setContent] = useState<string>('');
	const [name, setName] = useState<string>('');
	const [themeId, setThemeId] = useState<string>('default');
	const createNotebook = useCreateNotebook();
	const updateNotebook = useUpdateNotebook();
	const { goToNotebookList } = useMemoStore();
  const { tags } = useTagStore();

	const isEdit = !isCreate && !!notebookId;
	const { data: editingNotebook, isLoading: isLoadingNotebook } = useNotebook(notebookId);

	// 編集時、初回ロードでフォームに値をセット
	useEffect(() => {
		if (isEdit && editingNotebook) {
			setName(editingNotebook.name ?? '');
			setContent(editingNotebook.content ?? '');
			setThemeId(editingNotebook.themeId ?? editingNotebook.theme?.id ?? 'default');
		}
	}, [isEdit, editingNotebook]);

	// DBからテーマ取得（システム + 公開）
	const { data: systemThemes = [], isLoading: isLoadingSystem } = useSystemThemes();
	const { data: publicThemes = [], isLoading: isLoadingPublic } = usePublicThemes();
	const allThemes = useMemo(() => {
		const merged = [...systemThemes, ...publicThemes];
		const map = new Map<string, (typeof merged)[number]>();
		for (const t of merged) {
			if (!map.has(t.id)) map.set(t.id, t);
		}
		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
	}, [systemThemes, publicThemes]);

	const handleSave = () => {
		const payload = {
			name: name?.trim() ? name : null,
			content: content?.trim() ? content : null,
			themeId: themeId && themeId !== 'default' ? themeId : null,
		};

		if (isEdit && notebookId) {
			updateNotebook.mutate(
				{ id: notebookId, data: payload },
				{
					onSuccess: () => {
						goToNotebookList();
					},
					onError: (error) => {
						console.error('error update notebook', error);
					},
				}
			);
		} else {
			createNotebook.mutate(payload, {
				onSuccess: () => {
					console.log('success create notebook');
					goToNotebookList();
				},
				onError: (error) => {
					console.error('error create notebook', error);
				},
			});
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-end">
				<div className="flex items-center space-x-2">
					<TagDropdownIcon
						selectedTagIds={selectedTagIds}
						onToggleTag={(id) => {
							setSelectedTagIds((prev) =>
								prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
							);
						}}
					/>
					<button
						onClick={handleSave}
						disabled={createNotebook.isPending || updateNotebook.isPending || (isEdit && isLoadingNotebook)}
						className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{createNotebook.isPending || updateNotebook.isPending ? '保存中...' : isEdit ? '更新' : '保存'}
					</button>
					<button
						onClick={goToNotebookList}
						className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
					>
						キャンセル
					</button>
				</div>
			</div>
			{/* エディター */}
			<div className="flex-1 flex flex-col p-4 bg-white dark:bg-gray-900">
				{/* TODO: ノートブックテーマをstyle={}で反映 */}
				<div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
					<div className="mb-4">
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="ノートブック名を入力"
							className="text-2xl font-bold border-none outline-none placeholder-gray-400 dark:text-white bg-transparent w-full"
						/>
					</div>

				{/* テーマ選択（DBから取得したthemesをセレクト表示） */}
					<div className="mb-4">
						<label className="block text-sm font-medium mb-2 dark:text-white">テーマ</label>
						<select
							value={themeId}
							onChange={(e) => setThemeId(e.target.value)}
							className="border rounded px-3 py-2 dark:text-white bg-transparent w-full"
						>
							<option value="default">未選択（デフォルト）</option>
						{(isLoadingSystem || isLoadingPublic) && <option disabled>読み込み中...</option>}
						{!isLoadingSystem &&
							!isLoadingPublic &&
							allThemes.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					</div>

					{/* 選択中タグ（小さめ表示・現状保存対象外） */}
					{selectedTagIds.length > 0 && (
						<div className="mb-4 flex flex-wrap gap-1 text-xs text-gray-600 dark:text-gray-300">
							{selectedTagIds
								.map((id) => tags.find((t) => t.id === id))
								.filter(Boolean)
								.map((tag) => (
									<span
										key={tag!.id}
										className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px]"
										style={{
											borderColor: tag!.color,
											color: tag!.color,
											backgroundColor: `${tag!.color}15`,
										}}
									>
										{tag!.name}
									</span>
								))}
						</div>
					)}

					{/* コンテンツ入力エリア TODO:テーマ反映、placeholderを定義しても現れない */}
					{/*.ノートブックの内容をいきなりメモみたいに書けるようにして良いのか？→良い。どういう雰囲気なのか書きながらユーザが感じ取れるから */}
					<div className="relative flex-1 flex flex-col">
						<div className="flex-1">
							<RichTextEditor content={content} onChange={setContent} className="h-full" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
