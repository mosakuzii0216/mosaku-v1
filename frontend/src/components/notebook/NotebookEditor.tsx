import { useState } from 'react';
import { TagSelector } from '../tag/TagSelector';
import { RichTextEditor } from '../editor/RichTextEditor';
import { useCreateNotebook } from '../../hooks/useNotebookQueries';

interface NotebookEditorProps {
	isCreate?: boolean;
}

export const NotebookEditor = ({ isCreate = false }: NotebookEditorProps) => {
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const [content, setContent] = useState<string>('');
	const [name, setName] = useState<string>('');
	const [themeId, setThemeId] = useState<string>('default');
	const createNotebook = useCreateNotebook();

	const handleSave = () => {
		createNotebook.mutate(
			{
				name: name ?? null,
				content: content ?? null,
				themeId: themeId ?? null,
			},
			{
				onSuccess: () => {
					// 成功後の遷移
					console.log('success create notebook');
				},
				onError: (error) => {
					// エラーハンドリング
					console.error('error create notebook', error);
				},
			},
		);
	};

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
				<div className="flex items-center space-x-2">
					<button
						onClick={handleSave}
						disabled={createNotebook.isPending}
						className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{createNotebook.isPending ? '保存中...' : '保存'}
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

					{/* テーマ選択エリア TODO:テーマ選択できるように */}
					{/* <ThemeSelector>を使って実装したい */}
					<div className="mb-4">
						<select className="border-none outline-none dark:text-white bg-transparent w-full">
							<option value="default">デフォルト</option>
							{/* <option value="dark">ダーク</option>
							<option value="light">ライト</option> */}
						</select>
					</div>
					{/* タグ選択UI */}
					<div className="mb-4">
						<label className="block text-sm font-medium mb-2 dark:text-white">タグ</label>
						<TagSelector
							selectedTagIds={selectedTagIds}
							onTagsChange={setSelectedTagIds}
							className="w-full"
						/>
					</div>

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
