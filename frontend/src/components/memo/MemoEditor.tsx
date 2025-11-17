import { useState, useEffect, useCallback } from 'react';
import { useCreateMemo, useUpdateMemo } from '../../hooks/useMemoQueries';
import { useNotebooks } from '../../hooks/useNotebookQueries';
import { useTagQueries } from '../../hooks/useTagQueries';
import { loadThemeCSS } from '../../utils/themeLoader';
// import { TagSelector } from '../tag/TagSelector';
import { TagDropdownIcon } from '../tag/TagDropdownIcon';
import { useTagStore } from '../../stores/useTagStore';
import { RichTextEditor } from '../editor/RichTextEditor';
import type { Memo } from '../../types/memo';

interface MemoEditorProps {
	memo?: Memo;
	isCreate?: boolean;
}

export const MemoEditor = ({ memo, isCreate = false }: MemoEditorProps) => {
	const createMemo = useCreateMemo();
	const updateMemo = useUpdateMemo();
	const { assignTags } = useTagQueries();

	const [title, setTitle] = useState(memo?.title || '');
	const [content, setContent] = useState(memo?.content || '');
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
		memo?.memoTags?.map((mt) => mt.tag.id) || [],
	);
	const [selectedNotebookId, setSelectedNotebookId] = useState<string>(memo?.notebookId || '');

	const [hasChanges, setHasChanges] = useState(false);
	const { tags } = useTagStore();

	// ノートブックのテーマを取得
	const selectedTheme = memo?.notebook?.theme || null;

	// memo prop の変更を検知してエディタの状態を更新する
	useEffect(() => {
		if (isCreate) {
			// 新規作成モードの時は常に空にする
			setTitle('');
			setContent('');
			setSelectedTagIds([]);
			setSelectedNotebookId('');
			setHasChanges(false);
		} else if (memo) {
			// 編集モードの時はmemoの内容で更新
			setTitle(memo.title || '');
			setContent(memo.content || '');
			setSelectedTagIds(memo.memoTags?.map((mt) => mt.tag.id) || []);
			setSelectedNotebookId(memo.notebookId || '');
			// 新しいメモに切り替わったので、変更状態をリセット
			setHasChanges(false);
		}
	}, [memo, isCreate]);

	// テーマCSSの読み込み
	useEffect(() => {
		if (selectedTheme?.cssFilePath) {
			loadThemeCSS(selectedTheme.id, selectedTheme.cssFilePath).catch((error) => {
				console.error('Failed to load theme CSS:', error);
			});
		}
	}, [selectedTheme?.id, selectedTheme?.cssFilePath]);

	// 変更検知
	useEffect(() => {
		const originalTitle = memo?.title || '';
		const originalContent = memo?.content || '';
		const originalTagIds = memo?.memoTags?.map((mt) => mt.tag.id) || [];
		const originalNotebookId = memo?.notebookId || '';

		const tagsChanged =
			JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
		const notebookChanged = selectedNotebookId !== originalNotebookId;

		setHasChanges(
			title !== originalTitle ||
				content !== originalContent ||
				tagsChanged ||
				notebookChanged,
		);
	}, [title, content, selectedTagIds, selectedNotebookId, memo]);

	const handleSave = useCallback(async () => {
		if (!title.trim() && !content.trim()) {
			return;
		}

		try {
			if (isCreate) {
				const result = await new Promise<Memo>((resolve, reject) => {
					createMemo.mutate(
						{
							title: title.trim() || '無題',
							content: content.trim(),
							notebookId: selectedNotebookId || null,
						},
						{
							onSuccess: resolve,
							onError: reject,
						},
					);
				});

				// 新規作成後にタグを割り当て
				if (selectedTagIds.length > 0) {
					assignTags({ memoId: result.id, data: { tagIds: selectedTagIds } });
				}
			} else if (memo && hasChanges) {
				await new Promise<Memo>((resolve, reject) => {
					updateMemo.mutate(
						{
							id: memo.id,
							data: {
								title: title.trim() || '無題',
								content: content.trim(),
								notebookId: selectedNotebookId || null,
							},
						},
						{
							onSuccess: resolve,
							onError: reject,
						},
					);
				});

				// タグの変更があれば更新
				const originalTagIds = memo.memoTags?.map((mt) => mt.tag.id) || [];
				const tagsChanged =
					JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
				if (tagsChanged) {
					assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
				}
			}
		} catch (error) {
			console.error('保存に失敗しました:', error);
			// エラーハンドリング - ユーザーにエラーを通知
			alert('保存に失敗しました。もう一度お試しください。');
		}
	}, [
		title,
		content,
		selectedTagIds,
		isCreate,
		createMemo,
		memo,
		hasChanges,
		updateMemo,
		assignTags,
		selectedNotebookId,
	]);

	// キーボードショートカット（Ctrl+S / Cmd+S で保存）
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 's') {
				event.preventDefault();
				if (hasChanges && (title.trim() || content.trim())) {
					handleSave();
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [hasChanges, title, content, handleSave]);

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="border-b border-gray-200 p-4 flex items-center justify-end bg-white">
				<div className="flex items-center space-x-2">
					<TagDropdownIcon
						selectedTagIds={selectedTagIds}
						onToggleTag={(id) => {
							setSelectedTagIds((prev) =>
								prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
							);
						}}
					/>
					{hasChanges && (
						<span className="text-sm text-gray-500">未保存の変更があります</span>
					)}
					<button
						onClick={handleSave}
						disabled={
							!hasChanges ||
							(!title.trim() && !content.trim()) ||
							createMemo.isPending ||
							updateMemo.isPending
						}
						className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{createMemo.isPending || updateMemo.isPending ? '保存中...' : '保存'}
					</button>
				</div>
			</div>

			{/* エディター */}
			<div className="flex-1 flex flex-col p-4 bg-white">
				<div
					id={`memo-editor-${memo?.id || 'new'}`}
					className={`max-w-4xl mx-auto w-full flex-1 flex flex-col ${selectedTheme ? 'theme-root' : ''}`}
					data-theme-id={selectedTheme?.id}
				>
					{/* タイトル入力エリア */}
					<div className="mb-4">
						<input
							type="text"
							placeholder="タイトル"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className="memo-title text-2xl font-bold border-none outline-none placeholder-gray-400 bg-transparent w-full"
						/>
					</div>

					{/* ノートブック選択 */}
					<div className="mb-4">
						<label className="block text-sm font-medium mb-2">ノートブック</label>
						<NotebookSelect value={selectedNotebookId} onChange={setSelectedNotebookId} />
					</div>

					{/* 選択中タグの表示（小さめチップ） */}
					{selectedTagIds.length > 0 && (
						<div className="mb-3 flex flex-wrap gap-1 text-xs text-gray-600">
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

					{/* コンテンツ入力エリア */}
					<div className="memo-content relative flex-1 flex flex-col">
						<RichTextEditor
							content={content}
							onChange={setContent}
							placeholder="メモを入力..."
							className="h-full"
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

function NotebookSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	const { data: notebooks = [], isLoading } = useNotebooks();

	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="border rounded px-3 py-2 bg-transparent w-full"
		>
			<option value="">未選択</option>
			{isLoading && <option disabled>読み込み中...</option>}
			{!isLoading &&
				notebooks.map((nb) => (
					<option key={nb.id} value={nb.id}>
						{nb.name || '(名称未設定)'}
					</option>
				))}
		</select>
	);
}
