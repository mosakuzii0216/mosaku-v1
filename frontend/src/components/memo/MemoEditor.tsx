import { useState, useEffect, useCallback, useRef } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useCreateMemo, useUpdateMemo, useDeleteMemo } from '../../hooks/useMemoQueries';
import { useNotebooks } from '../../hooks/useNotebookQueries';
import { useTagQueries } from '../../hooks/useTagQueries';
import { type OfflineSavedSignal, useAutoSave } from '../../hooks/useAutoSave';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import { useViewStore } from '../../stores/useViewStore';
import { TagDropdownIcon } from '../tag/TagDropdownIcon';
import { OfflineBadge } from '../ui/OfflineBadge';
import { RichTextEditor } from '../editor/RichTextEditor';
import { ShareMemoControl } from './ShareMemoControl';
import type { Memo } from '../../types/memo';
import type { MemoUpdateOutcome } from '../../utils/memo/memo-bridge';
import type { SaveStatus } from '../../hooks/useAutoSave';
import { describeDeleteConfirm } from '../../utils/memo/save-status-presentation';
import {
	describeSaveStatus,
	formatRelativeTime,
	SAVE_STATUS_TONE_CLASSES,
} from '../../utils/editor/save-status-presentation';
import { logger } from '../../utils/logger';
import { getPendingMemoTitle, clearPendingMemoTitle } from '../../hooks/useNavigation';
import { createEmptyDoc, isEmptyDoc } from '../../utils/editor/prosemirrorText';
import { isJsonContentEqual } from '../editor/contentSync';

interface MemoEditorProps {
	memo?: Memo;
	isCreate?: boolean;
}

export const MemoEditor = ({ memo, isCreate = false }: MemoEditorProps) => {
	const createMemo = useCreateMemo();
	const updateMemo = useUpdateMemo();
	const deleteMemo = useDeleteMemo();
	const { assignTags, tagsQuery } = useTagQueries();
	const tags = tagsQuery.data ?? [];
	const setSelectedMemoId = useMemoDataStore((s) => s.setSelectedMemoId);
	const setStoreNotebookId = useMemoDataStore((s) => s.setSelectedNotebookId);
	const setCurrentView = useViewStore((s) => s.setCurrentView);
	const openDisplayMode = useViewStore((s) => s.openDisplayMode);
	const { status: networkStatus } = useNetworkStatus();

	const [title, setTitle] = useState(memo?.title || '');
	const [content, setContent] = useState<JSONContent>(memo?.content || createEmptyDoc());
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
		memo?.memoTags?.map((mt) => mt.tag.id) || [],
	);
	const [selectedNotebookId, setSelectedNotebookId] = useState<string>(memo?.notebookId || '');

	const [hasChanges, setHasChanges] = useState(false);

	const pendingCreatedIdRef = useRef<string | null>(null);

	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
		memo?.updatedAt ? new Date(memo.updatedAt) : null,
	);
	const [, setTick] = useState(0);

	const isSaving = createMemo.isPending || updateMemo.isPending;
	const canSave = hasChanges && (!!title.trim() || !isEmptyDoc(content));

	const handleSave = useCallback(async (): Promise<void | OfflineSavedSignal> => {
		if (!title.trim() && isEmptyDoc(content)) {
			return;
		}

		if (isCreate) {
			const result = await new Promise<Memo>((resolve, reject) => {
				createMemo.mutate(
					{
						title: title.trim() || '無題',
						content,
						notebookId: selectedNotebookId || null,
					},
					{
						onSuccess: resolve,
						onError: reject,
					},
				);
			});

			pendingCreatedIdRef.current = result.id;

			if (selectedTagIds.length > 0) {
				assignTags({ memoId: result.id, data: { tagIds: selectedTagIds } });
			}

			setSelectedMemoId(result.id);
			setCurrentView('edit');
			return;
		}

		if (memo && hasChanges) {
			const outcome = await new Promise<MemoUpdateOutcome>((resolve, reject) => {
				updateMemo.mutate(
					{
						id: memo.id,
						data: {
							title: title.trim() || '無題',
							content,
							notebookId: selectedNotebookId || null,
						},
					},
					{
						onSuccess: resolve,
						onError: reject,
					},
				);
			});

			if (outcome.kind === 'synced') {
				const originalTagIds = memo.memoTags?.map((mt) => mt.tag.id) || [];
				const tagsChanged =
					JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
				if (tagsChanged) {
					assignTags({ memoId: memo.id, data: { tagIds: selectedTagIds } });
				}
				return;
			}

			return outcome.signal;
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
		setSelectedMemoId,
		setCurrentView,
	]);

	const { saveStatus, scheduleAutoSave, cancelDebounce } = useAutoSave({
		canSave,
		isSaving,
		onSave: handleSave,
	});

	useEffect(() => {
		if (saveStatus === 'saved') {
			setLastSavedAt(new Date());
		}
	}, [saveStatus]);

	useEffect(() => {
		if (!lastSavedAt) return;
		const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
		return () => clearInterval(id);
	}, [lastSavedAt]);

	const memoId = memo?.id;
	useEffect(() => {
		cancelDebounce();
		if (isCreate) {
			const pending = getPendingMemoTitle();
			if (pending) {
				clearPendingMemoTitle();
				setTitle(pending);
			} else {
				setTitle('');
			}
			setContent(createEmptyDoc());
			setSelectedTagIds([]);
			setSelectedNotebookId('');
			setStoreNotebookId(null);
			setHasChanges(false);
			setLastSavedAt(null);
		} else if (memo) {
			if (pendingCreatedIdRef.current === memo.id) {
				pendingCreatedIdRef.current = null;
				setStoreNotebookId(memo.notebookId || null);
				setLastSavedAt(memo.updatedAt ? new Date(memo.updatedAt) : new Date());
				if (
					(memo.title || '') !== title ||
					!isJsonContentEqual(content, memo.content || createEmptyDoc())
				) {
					scheduleAutoSave();
				}
			} else {
				setTitle(memo.title || '');
				setContent(memo.content || createEmptyDoc());
				setSelectedTagIds(memo.memoTags?.map((mt) => mt.tag.id) || []);
				setSelectedNotebookId(memo.notebookId || '');
				setStoreNotebookId(memo.notebookId || null);
				setHasChanges(false);
				setLastSavedAt(memo.updatedAt ? new Date(memo.updatedAt) : null);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [memoId, isCreate, cancelDebounce]);

	useEffect(() => {
		return () => {
			setStoreNotebookId(null);
		};
	}, [setStoreNotebookId]);

	useEffect(() => {
		const originalTitle = memo?.title || '';
		const originalContent = memo?.content || createEmptyDoc();
		const originalTagIds = memo?.memoTags?.map((mt) => mt.tag.id) || [];
		const originalNotebookId = memo?.notebookId || '';

		const tagsChanged =
			JSON.stringify(selectedTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
		const notebookChanged = selectedNotebookId !== originalNotebookId;
		const contentChanged = !isJsonContentEqual(content, originalContent);

		setHasChanges(title !== originalTitle || contentChanged || tagsChanged || notebookChanged);
	}, [title, content, selectedTagIds, selectedNotebookId, memo]);

	const handleDelete = useCallback(async () => {
		if (!memo) return;

		const confirmMessage = describeDeleteConfirm({
			kind: 'trash',
			networkStatus,
		});
		if (!window.confirm(confirmMessage)) {
			return;
		}

		try {
			await deleteMemo.mutateAsync(memo.id);
		} catch (error) {
			logger.error('削除に失敗しました:', error);
			alert('削除に失敗しました。もう一度お試しください。');
		}
	}, [memo, deleteMemo, networkStatus]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 's') {
				event.preventDefault();
				if (hasChanges && (title.trim() || !isEmptyDoc(content))) {
					cancelDebounce();
					handleSave().catch((error) => logger.error('保存に失敗しました:', error));
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [hasChanges, title, content, handleSave, cancelDebounce]);

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="border-b border-gray-200 p-4 flex items-center justify-end">
				<div className="flex items-center space-x-2">
					<OfflineBadge variant="detail" className="mr-1" />
					{!isCreate && memo && <ShareMemoControl memo={memo} />}
					<TagDropdownIcon
						selectedTagIds={selectedTagIds}
						onToggleTag={(id) => {
							setSelectedTagIds((prev) =>
								prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
							);
							scheduleAutoSave();
						}}
					/>
					{(() => {
						const displayStatus: SaveStatus =
							!isCreate && memo && saveStatus === 'idle' ? 'saved' : saveStatus;
						const desc = describeSaveStatus(displayStatus);
						if (!desc.label) return null;
						const label =
							displayStatus === 'saved' && lastSavedAt
								? `${desc.label}（${formatRelativeTime(new Date(), lastSavedAt)}）`
								: desc.label;
						return (
							<span
								data-testid="save-status-label"
								className={`text-sm ${SAVE_STATUS_TONE_CLASSES[desc.tone]}`}
							>
								{label}
							</span>
						);
					})()}
					{!isCreate && memo && (
						<button
							data-testid="display-mode-button"
							onClick={openDisplayMode}
							className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
							title="表示モードで開く"
						>
							表示
						</button>
					)}
					<button
						onClick={async () => {
							cancelDebounce();
							try {
								await handleSave();
							} catch (error) {
								logger.error('手動保存に失敗しました:', error);
							}
						}}
						disabled={!hasChanges || (isEmptyDoc(content) && !title.trim()) || isSaving}
						className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSaving ? '保存中...' : '保存'}
					</button>
					{!isCreate && memo && (
						<button
							onClick={handleDelete}
							disabled={deleteMemo.isPending}
							className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{deleteMemo.isPending ? '削除中...' : '削除'}
						</button>
					)}
				</div>
			</div>

			{/* エディター */}
			<div className="flex-1 flex flex-col p-4">
				<div
					id={`memo-editor-${memo?.id || 'new'}`}
					className="max-w-4xl mx-auto w-full flex-1 flex flex-col"
				>
					<div className="mb-4">
						<input
							type="text"
							placeholder="タイトル"
							value={title}
							onChange={(e) => {
								setTitle(e.target.value);
								scheduleAutoSave();
							}}
							className="memo-title text-2xl font-bold border-none outline-none placeholder-gray-400 bg-transparent w-full"
						/>
					</div>

					<div className="mb-4">
						<label className="block text-sm font-medium mb-2">ノートブック</label>
						<NotebookSelect
							value={selectedNotebookId}
							onChange={(val) => {
								setSelectedNotebookId(val);
								setStoreNotebookId(val || null);
								scheduleAutoSave();
							}}
						/>
					</div>

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

					<div className="memo-content relative flex-1 flex flex-col">
						<RichTextEditor
							content={content}
							onChange={(val) => {
								setContent(val);
								scheduleAutoSave();
							}}
							placeholder="メモを入力..."
							className="h-full"
							autofocus={isCreate}
							focusKey={memo?.id || 'new'}
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
