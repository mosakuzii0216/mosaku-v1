import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TagDropdownIcon } from '../tag/TagDropdownIcon';
import { RichTextEditor } from '../editor/RichTextEditor';
import { useCreateNotebook, useNotebook, useUpdateNotebook } from '../../hooks/useNotebookQueries';
import { useSystemThemes, usePublicThemes } from '../../hooks/useThemeQueries';
import { useTagQueries } from '../../hooks/useTagQueries';
import { useThemeCSS } from '../../hooks/useThemeCSS';
import { useAutoSave } from '../../hooks/useAutoSave';
import type { SaveStatus } from '../../hooks/useAutoSave';
import { useViewStore } from '../../stores/useViewStore';
import { useMemoDataStore } from '../../stores/useMemoDataStore';
import { apiClient } from '../../utils/api';
import { logger } from '../../utils/logger';
import { queryKeys } from '../../constants/queryKeys';
import {
	describeSaveStatus,
	formatRelativeTime,
	SAVE_STATUS_TONE_CLASSES,
} from '../../utils/editor/save-status-presentation';

const CREATE_SENTINEL = '__create__';

interface NotebookEditorProps {
	isCreate?: boolean;
	notebookId?: string;
}

export const NotebookEditor = ({ isCreate, notebookId }: NotebookEditorProps) => {
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const [originalTagIds, setOriginalTagIds] = useState<string[]>([]);
	const [content, setContent] = useState<string>('');
	const [name, setName] = useState<string>('');
	const [themeId, setThemeId] = useState<string>('default');
	const [hasChanges, setHasChanges] = useState<boolean>(false);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
	const [, setTick] = useState(0);

	const syncedNotebookIdRef = useRef<string | null>(null);

	const createNotebook = useCreateNotebook();
	const updateNotebook = useUpdateNotebook();
	const queryClient = useQueryClient();
	const { goToNotebookList, setCurrentView } = useViewStore();
	const setSelectedNotebookId = useMemoDataStore((s) => s.setSelectedNotebookId);
	const { tagsQuery } = useTagQueries();
	const tags = tagsQuery.data ?? [];

	const isEdit = !isCreate && !!notebookId;
	const { data: editingNotebook, isLoading: isLoadingNotebook } = useNotebook(notebookId);

	const isSaving = createNotebook.isPending || updateNotebook.isPending;
	const canSave = hasChanges && !!(name.trim() || content.trim());

	const reflectTags = useCallback(
		async (id: string) => {
			const tagsDiffer =
				JSON.stringify([...selectedTagIds].sort()) !== JSON.stringify([...originalTagIds].sort());
			if (!tagsDiffer) return;
			try {
				await apiClient.assignTagsToNotebook(id, { tagIds: selectedTagIds });
				setOriginalTagIds(selectedTagIds);
			} catch (e) {
				logger.error('failed to assign tags to notebook', e);
			}
		},
		[selectedTagIds, originalTagIds],
	);

	const handleSave = useCallback(async (): Promise<void> => {
		const trimmedName = name.trim();
		const trimmedContent = content.trim();
		if (!trimmedName && !trimmedContent) return;

		const payload = {
			name: trimmedName ? name : null,
			content: trimmedContent ? content : null,
			themeId: themeId !== 'default' ? themeId : null,
		};

		if (isEdit && notebookId) {
			await updateNotebook.mutateAsync({ id: notebookId, data: payload });
			await reflectTags(notebookId);
			return;
		}

		const nb = await createNotebook.mutateAsync(payload);
		queryClient.setQueryData(queryKeys.notebooks.detail(nb.id), nb);
		await reflectTags(nb.id);
		setSelectedNotebookId(nb.id);
		setCurrentView('edit');
	}, [
		name,
		content,
		themeId,
		isEdit,
		notebookId,
		updateNotebook,
		createNotebook,
		queryClient,
		reflectTags,
		setSelectedNotebookId,
		setCurrentView,
	]);

	const { saveStatus, scheduleAutoSave, cancelDebounce } = useAutoSave({
		canSave,
		isSaving,
		onSave: handleSave,
	});

	// saved に到達したら最終保存時刻を更新
	useEffect(() => {
		if (saveStatus === 'saved') {
			setLastSavedAt(new Date());
		}
	}, [saveStatus]);

	// 30 秒ごとに相対時刻表示を更新
	useEffect(() => {
		if (!lastSavedAt) return;
		const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
		return () => clearInterval(id);
	}, [lastSavedAt]);

	// 編集対象切替の再同期（id ベースの ref ガード）
	useEffect(() => {
		if (isCreate) {
			if (syncedNotebookIdRef.current !== CREATE_SENTINEL) {
				cancelDebounce();
				setName('');
				setContent('');
				setThemeId('default');
				setSelectedTagIds([]);
				setOriginalTagIds([]);
				setLastSavedAt(null);
				setHasChanges(false);
				syncedNotebookIdRef.current = CREATE_SENTINEL;
			}
			return;
		}
		if (!notebookId || !editingNotebook) return;
		if (syncedNotebookIdRef.current === notebookId) return; // 同一 id の再フェッチは無視
		cancelDebounce();
		setName(editingNotebook.name ?? '');
		setContent(editingNotebook.content ?? '');
		setThemeId(editingNotebook.themeId ?? editingNotebook.theme?.id ?? 'default');
		setLastSavedAt(editingNotebook.updatedAt ? new Date(editingNotebook.updatedAt) : null);
		setHasChanges(false);
		syncedNotebookIdRef.current = notebookId;
		apiClient
			.getNotebookTags(editingNotebook.id)
			.then((pairs) => {
				const ids = pairs.map((p) => p.tagId);
				setSelectedTagIds(ids);
				setOriginalTagIds(ids);
			})
			.catch((e) => logger.error('failed to load notebook tags', e));
	}, [notebookId, isCreate, editingNotebook, cancelDebounce]);

	// 変更検知（タグ差分を含む）
	useEffect(() => {
		if (isCreate) {
			setHasChanges(name.trim().length > 0 || content.trim().length > 0);
			return;
		}
		if (!editingNotebook) return;

		const originalName = editingNotebook.name ?? '';
		const originalContent = editingNotebook.content ?? '';
		const originalThemeId = editingNotebook.themeId ?? editingNotebook.theme?.id ?? 'default';
		const tagsDiffer =
			JSON.stringify([...selectedTagIds].sort()) !== JSON.stringify([...originalTagIds].sort());

		setHasChanges(
			name !== originalName ||
				content !== originalContent ||
				themeId !== originalThemeId ||
				tagsDiffer,
		);
	}, [name, content, themeId, selectedTagIds, originalTagIds, editingNotebook, isCreate]);

	// キーボードショートカット（Ctrl+S / Cmd+S で即時保存）
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 's') {
				event.preventDefault();
				if (canSave) {
					cancelDebounce();
					handleSave().catch((e) => logger.error('手動保存に失敗しました:', e));
				}
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [canSave, handleSave, cancelDebounce]);

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

	const selectedTheme = useMemo(() => {
		if (!themeId || themeId === 'default') return null;
		return allThemes.find((t) => t.id === themeId);
	}, [themeId, allThemes]);

	useThemeCSS(selectedTheme);

	return (
		<div className="flex flex-col h-full">
			{/* ヘッダー */}
			<div className="border-b border-gray-200 p-4 flex items-center justify-between">
				<div className="flex items-center space-x-2 ml-auto">
					<TagDropdownIcon
						selectedTagIds={selectedTagIds}
						onToggleTag={(id) => {
							setSelectedTagIds((prev) =>
								prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
							);
							scheduleAutoSave();
						}}
					/>
					{/* 保存状態インジケーター */}
					{(() => {
						// 新規作成中でまだ保存対象が確定していない場合は表示しない
						if (isCreate && saveStatus === 'idle') return null;
						const displayStatus: SaveStatus =
							!isCreate && editingNotebook && saveStatus === 'idle' ? 'saved' : saveStatus;
						const desc = describeSaveStatus(displayStatus);
						if (!desc.label) return null;
						const label =
							displayStatus === 'saved' && lastSavedAt
								? `${desc.label}（${formatRelativeTime(new Date(), lastSavedAt)}）`
								: desc.label;
						return (
							<span
								data-testid="notebook-save-status-label"
								className={`text-sm ${SAVE_STATUS_TONE_CLASSES[desc.tone]}`}
							>
								{label}
							</span>
						);
					})()}
					<button
						onClick={async () => {
							cancelDebounce();
							try {
								await handleSave();
							} catch (e) {
								logger.error('手動保存に失敗しました:', e);
							}
						}}
						disabled={!canSave || isSaving || (isEdit && isLoadingNotebook)}
						className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSaving ? '保存中...' : isEdit ? '更新' : '保存'}
					</button>
					<button
						onClick={goToNotebookList}
						className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
					>
						閉じる
					</button>
				</div>
			</div>
			{/* エディター */}
			<div className="flex-1 flex flex-col p-4 bg-white">
				<div
					className={`max-w-4xl mx-auto w-full flex-1 flex flex-col ${selectedTheme ? 'theme-root' : ''}`}
					data-theme-id={selectedTheme?.id}
				>
					<div className="mb-4">
						<input
							type="text"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								scheduleAutoSave();
							}}
							placeholder="ノートブック名を入力"
							className="memo-title text-2xl font-bold border-none outline-none placeholder-gray-400 bg-transparent w-full"
						/>
					</div>

					{/* テーマ選択 */}
					<div className="mb-4">
						<label className="block text-sm font-medium mb-2">テーマ</label>
						<select
							value={themeId}
							onChange={(e) => {
								setThemeId(e.target.value);
								scheduleAutoSave();
							}}
							className="border rounded px-3 py-2 bg-transparent w-full"
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

					{/* 選択中タグ */}
					{selectedTagIds.length > 0 && (
						<div className="mb-4 flex flex-wrap gap-1 text-xs text-gray-600">
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
							onChange={(v) => {
								setContent(v);
								scheduleAutoSave();
							}}
							className="h-full"
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
