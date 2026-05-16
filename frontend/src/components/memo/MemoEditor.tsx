import { useState, useEffect, useCallback } from 'react';
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
import type { Memo } from '../../types/memo';
import type { MemoUpdateOutcome } from '../../utils/memo/memo-bridge';
import type { SaveStatus } from '../../hooks/useAutoSave';
import {
	describeDeleteConfirm,
	describeSaveStatus,
	formatRelativeTime,
	type SaveStatusTone,
} from '../../utils/memo/save-status-presentation';
import { logger } from '../../utils/logger';

const SAVE_STATUS_TONE_CLASSES: Record<SaveStatusTone, string> = {
	idle: 'text-gray-400',
	progress: 'text-blue-400',
	success: 'text-green-500',
	warn: 'text-amber-600',
	error: 'text-red-500',
};

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
	const setCurrentView = useViewStore((s) => s.setCurrentView);
	const { status: networkStatus } = useNetworkStatus();

	const [title, setTitle] = useState(memo?.title || '');
	const [content, setContent] = useState(memo?.content || '');
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
		memo?.memoTags?.map((mt) => mt.tag.id) || [],
	);
	const [selectedNotebookId, setSelectedNotebookId] = useState<string>(memo?.notebookId || '');

	const [hasChanges, setHasChanges] = useState(false);

	// 最終保存時刻。初期値は既存メモの updatedAt、自動/手動保存成功時に現在時刻へ更新。
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
		memo?.updatedAt ? new Date(memo.updatedAt) : null,
	);
	// 相対時刻ラベルを進めるための tick（30秒ごとに再描画）。
	// 秒単位の精度は不要（「今しがた」「N秒前」「N分前」…の表示なので 30秒間隔で十分）。
	const [, setTick] = useState(0);

	// useAutoSave に渡す派生値（レンダリング中に同期計算）
	const isSaving = createMemo.isPending || updateMemo.isPending;
	const canSave = hasChanges && (!!title.trim() || !!content.trim());

	// 保存処理本体（エラーは呼び出し元に伝播させる）
	const handleSave = useCallback(async (): Promise<void | OfflineSavedSignal> => {
		if (!title.trim() && !content.trim()) {
			return;
		}

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

			// task 2.2: create 成功後に edit モードへ遷移（重複作成防止）
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

			// オンライン同期成功時のみタグを更新（オフライン時は対応キューを別途用意するまで未対応）
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

	// saved に到達したら最終保存時刻を現在時刻に更新
	useEffect(() => {
		if (saveStatus === 'saved') {
			setLastSavedAt(new Date());
		}
	}, [saveStatus]);

	// 「N秒前」「N分前」の相対表示を進めるための再描画 tick
	useEffect(() => {
		if (!lastSavedAt) return;
		const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
		return () => clearInterval(id);
	}, [lastSavedAt]);

	// 編集対象 memo が切り替わったときだけ state を再同期する。
	// memo オブジェクト全体を依存にすると、保存完了後の React Query invalidate で
	// 参照だけが変わった memo が渡し直され、直近の入力が上書きされて消える（dogfooding で発覚）。
	const memoId = memo?.id;
	useEffect(() => {
		cancelDebounce();
		if (isCreate) {
			setTitle('');
			setContent('');
			setSelectedTagIds([]);
			setSelectedNotebookId('');
			setHasChanges(false);
			setLastSavedAt(null);
		} else if (memo) {
			setTitle(memo.title || '');
			setContent(memo.content || '');
			setSelectedTagIds(memo.memoTags?.map((mt) => mt.tag.id) || []);
			setSelectedNotebookId(memo.notebookId || '');
			setHasChanges(false);
			setLastSavedAt(memo.updatedAt ? new Date(memo.updatedAt) : null);
		}
		// memo の中身ではなく id の切り替えだけを依存にする。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [memoId, isCreate, cancelDebounce]);

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
			title !== originalTitle || content !== originalContent || tagsChanged || notebookChanged,
		);
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

	// キーボードショートカット（Ctrl+S / Cmd+S で保存）
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 's') {
				event.preventDefault();
				if (hasChanges && (title.trim() || content.trim())) {
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
					<TagDropdownIcon
						selectedTagIds={selectedTagIds}
						onToggleTag={(id) => {
							setSelectedTagIds((prev) =>
								prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
							);
							scheduleAutoSave();
						}}
					/>
					{/* 保存状態インジケーター（exhaustive switch via describeSaveStatus）
					    既存メモを編集中で saveStatus が 'idle' のとき（＝初期表示 or 直近の編集が
					    全て巻き戻された無変更状態）は 'saved' とみなして「保存済み」を出す。
					    新規作成中は何も表示しない（保存対象がまだ存在しないため）。
					    'saved' のときは最終保存時刻からの相対表示も併記して安心感を出す。*/}
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
					<button
						onClick={async () => {
							cancelDebounce();
							try {
								await handleSave();
							} catch (error) {
								logger.error('手動保存に失敗しました:', error);
							}
						}}
						disabled={!hasChanges || (!title.trim() && !content.trim()) || isSaving}
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
					{/* タイトル入力エリア */}
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

					{/* ノートブック選択 */}
					<div className="mb-4">
						<label className="block text-sm font-medium mb-2">ノートブック</label>
						<NotebookSelect
							value={selectedNotebookId}
							onChange={(val) => {
								setSelectedNotebookId(val);
								scheduleAutoSave();
							}}
						/>
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
