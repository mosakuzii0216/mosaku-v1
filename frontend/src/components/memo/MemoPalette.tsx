import { useState, useEffect, useRef, useMemo } from 'react';
import { useNotebooks } from '../../hooks/useNotebookQueries';
import { useMemos } from '../../hooks/useMemoQueries';
import { usePaletteStore } from '../../stores/usePaletteStore';
import { useNavigation } from '../../hooks/useNavigation';
import type { Memo } from '../../types/memo';
import { logger } from '../../utils/logger';
import { extractPlainText } from '../../utils/editor/prosemirrorText';
import { formatDateJa } from '../../utils/formatDate';

type PaletteMode = 'notebook-select' | 'memo-select';

interface MemoPaletteProps {
	isOpen: boolean;
	onClose: () => void;
	initialMode?: PaletteMode;
}

export const MemoPalette = ({ isOpen, onClose, initialMode = 'memo-select' }: MemoPaletteProps) => {
	const [mode, setMode] = useState<PaletteMode>(initialMode);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const { paletteNotebookFilter } = usePaletteStore();
	const { goToEdit } = useNavigation();
	const { data: notebooks = [] } = useNotebooks();
	const { data: memos = [] } = useMemos();

	// パレット開閉時に、ストアのnotebookFilterを反映
	useEffect(() => {
		if (isOpen && paletteNotebookFilter) {
			setSelectedNotebookId(paletteNotebookFilter);
		}
	}, [isOpen, paletteNotebookFilter]);

	// モード変更時にsearchQueryとselectedIndexをリセット
	useEffect(() => {
		setSearchQuery('');
		setSelectedIndex(0);
	}, [mode]);

	// パレットが開いたときにフォーカス
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isOpen]);

	// モード変更時に初期化
	useEffect(() => {
		if (isOpen) {
			setMode(initialMode);
			setSearchQuery('');
			setSelectedIndex(0);
		}
	}, [isOpen, initialMode]);

	// フィルタリングされたノートブック一覧（useMemoで最適化）
	const notebookOptions = useMemo(() => {
		const filteredNotebooks = notebooks.filter((nb) =>
			nb.name?.toLowerCase().includes(searchQuery.toLowerCase()),
		);

		return [
			{ id: 'ALL', name: 'すべてのメモ', isSpecial: true },
			{ id: 'INBOX', name: '未選択', isSpecial: true },
			...filteredNotebooks.map((nb) => ({ ...nb, isSpecial: false })),
		];
	}, [notebooks, searchQuery]);

	// フィルタリングされたメモ一覧（useMemoで最適化）
	const filteredMemos = useMemo(() => {
		logger.debug('[MemoPalette] Filtering memos:', {
			totalMemos: memos.length,
			selectedNotebookId,
			searchQuery,
			sampleMemo: memos[0],
		});

		const filtered = memos.filter((memo) => {
			// ノートブックフィルタ
			if (selectedNotebookId) {
				if (selectedNotebookId === 'ALL') {
					// すべて表示
				} else if (selectedNotebookId === 'INBOX') {
					if (memo.notebookId) return false;
				} else {
					if (memo.notebookId !== selectedNotebookId) return false;
				}
			}

			// 検索クエリフィルタ
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				// content は JSONContent（ProseMirror doc）。文字列メソッドは使えない
				return (
					memo.title.toLowerCase().includes(query) ||
					extractPlainText(memo.content).toLowerCase().includes(query)
				);
			}

			return true;
		});

		logger.debug('[MemoPalette] Filtered result:', {
			filteredCount: filtered.length,
			filtered: filtered
				.slice(0, 3)
				.map((m) => ({ id: m.id, title: m.title, notebookId: m.notebookId })),
		});

		return filtered;
	}, [memos, selectedNotebookId, searchQuery]);

	// キーボードナビゲーション
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			const items = mode === 'notebook-select' ? notebookOptions : filteredMemos;

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
					break;

				case 'ArrowUp':
					e.preventDefault();
					setSelectedIndex((prev) => Math.max(prev - 1, 0));
					break;

				case 'Enter':
					e.preventDefault();
					if (mode === 'notebook-select' && items.length > 0) {
						const selected = items[selectedIndex] as (typeof notebookOptions)[0];
						logger.debug('[MemoPalette] Notebook selected:', selected);
						setSelectedNotebookId(selected.id);
						setMode('memo-select');
					} else if (mode === 'memo-select' && items.length > 0) {
						const selected = items[selectedIndex] as Memo;
						goToEdit(selected);
						onClose();
					}
					break;

				case 'Escape':
					e.preventDefault();
					if (mode === 'memo-select' && selectedNotebookId && initialMode === 'notebook-select') {
						// memo-selectモードでnotebook-selectから来た場合は戻る
						setMode('notebook-select');
						setSelectedNotebookId(null);
					} else {
						onClose();
					}
					break;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [
		isOpen,
		mode,
		selectedIndex,
		notebookOptions,
		filteredMemos,
		selectedNotebookId,
		initialMode,
		goToEdit,
		onClose,
	]);

	// 選択インデックスが範囲外にならないように調整
	useEffect(() => {
		const items = mode === 'notebook-select' ? notebookOptions : filteredMemos;
		if (selectedIndex >= items.length) {
			setSelectedIndex(Math.max(0, items.length - 1));
		}
	}, [mode, notebookOptions, filteredMemos, selectedIndex]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
			{/* オーバーレイ */}
			<div className="shell-scrim absolute inset-0" onClick={onClose} />

			{/* パレット本体 */}
			<div className="shell-popover relative w-full max-w-2xl mx-4 overflow-hidden">
				{/* 検索入力 */}
				<div className="p-4 border-b border-[var(--outline)]">
					<input
						ref={inputRef}
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder={
							mode === 'notebook-select'
								? 'ノートブックを検索...'
								: 'メモを検索... (タイトル、内容)'
						}
						className="shell-field w-full border-none outline-none"
					/>
				</div>

				{/* ノートブックフィルタ（memo-selectモード時のみ） */}
				{mode === 'memo-select' && (
					<div className="shell-surface px-4 py-2 border-b border-[var(--outline)] flex items-center gap-2">
						<span className="shell-text-muted text-sm">ノートブック:</span>
						<button
							onClick={() => {
								if (initialMode === 'notebook-select') {
									setMode('notebook-select');
									setSelectedNotebookId(null);
								}
							}}
							className="shell-button-primary text-sm px-2 py-1"
						>
							{selectedNotebookId === 'ALL'
								? 'すべて'
								: selectedNotebookId === 'INBOX'
									? '未選択'
									: notebooks.find((nb) => nb.id === selectedNotebookId)?.name || 'すべて'}
						</button>
					</div>
				)}

				{/* 結果一覧 */}
				<div className="max-h-96 overflow-y-auto" role="listbox">
					{mode === 'notebook-select' ? (
						<NotebookList
							notebooks={notebookOptions}
							selectedIndex={selectedIndex}
							onSelect={(nb) => {
								logger.debug('[MemoPalette] Notebook clicked:', nb);
								setSelectedNotebookId(nb.id);
								setMode('memo-select');
							}}
						/>
					) : (
						<MemoList
							memos={filteredMemos}
							selectedIndex={selectedIndex}
							onSelect={(memo) => {
								goToEdit(memo);
								onClose();
							}}
						/>
					)}
				</div>

				{/* フッター（ヒント） */}
				<div className="shell-surface px-4 py-2 border-t border-[var(--outline)] text-xs flex items-center justify-between">
					<div className="flex gap-4">
						<span className="shell-text-muted">
							<kbd className="shell-button px-1 py-0.5">↑↓</kbd> 選択
						</span>
						<span className="shell-text-muted">
							<kbd className="shell-button px-1 py-0.5">Enter</kbd> 決定
						</span>
						<span className="shell-text-muted">
							<kbd className="shell-button px-1 py-0.5">Esc</kbd> 閉じる
						</span>
					</div>
					{mode === 'memo-select' && (
						<div className="shell-text-muted">{filteredMemos.length} 件のメモ</div>
					)}
				</div>
			</div>
		</div>
	);
};

// ノートブック一覧コンポーネント
interface NotebookListProps {
	notebooks: Array<{ id: string; name: string | null; isSpecial: boolean }>;
	selectedIndex: number;
	onSelect: (notebook: { id: string; name: string | null }) => void;
}

const NotebookList = ({ notebooks, selectedIndex, onSelect }: NotebookListProps) => {
	const listRef = useRef<HTMLDivElement>(null);

	// 選択アイテムを表示領域内にスクロール
	useEffect(() => {
		if (listRef.current) {
			const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
			if (selectedElement) {
				selectedElement.scrollIntoView({ block: 'nearest' });
			}
		}
	}, [selectedIndex]);

	if (notebooks.length === 0) {
		return <div className="shell-text-muted p-8 text-center">ノートブックが見つかりません</div>;
	}

	return (
		<div ref={listRef}>
			{notebooks.map((nb, index) => (
				<div
					key={nb.id}
					role="option"
					aria-selected={index === selectedIndex}
					onClick={() => onSelect(nb)}
					className={`shell-popover-item px-4 py-3 cursor-pointer border-l-4 ${
						index === selectedIndex ? 'border-[var(--accent)]' : 'border-transparent'
					}`}
				>
					<div className="font-medium">{nb.name || '(名称未設定)'}</div>
					{nb.isSpecial && (
						<div className="shell-text-muted mt-1">
							{nb.id === 'ALL' ? '全てのメモを表示' : 'ノートブック未設定のメモ'}
						</div>
					)}
				</div>
			))}
		</div>
	);
};

// メモ一覧コンポーネント
interface MemoListProps {
	memos: Memo[];
	selectedIndex: number;
	onSelect: (memo: Memo) => void;
}

const MemoList = ({ memos, selectedIndex, onSelect }: MemoListProps) => {
	const listRef = useRef<HTMLDivElement>(null);

	// 選択アイテムを表示領域内にスクロール
	useEffect(() => {
		if (listRef.current) {
			const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
			if (selectedElement) {
				selectedElement.scrollIntoView({ block: 'nearest' });
			}
		}
	}, [selectedIndex]);

	if (memos.length === 0) {
		return <div className="shell-text-muted p-8 text-center">メモが見つかりません</div>;
	}

	return (
		<div ref={listRef}>
			{memos.map((memo, index) => (
				<div
					key={memo.id}
					role="option"
					aria-selected={index === selectedIndex}
					onClick={() => onSelect(memo)}
					className={`shell-popover-item px-4 py-3 cursor-pointer border-l-4 ${
						index === selectedIndex ? 'border-[var(--accent)]' : 'border-transparent'
					}`}
				>
					<div className="font-medium">{memo.title || '無題'}</div>
					{extractPlainText(memo.content) && (
						<div className="shell-text-muted mt-1 line-clamp-2">
							{extractPlainText(memo.content).substring(0, 100)}
						</div>
					)}
					<div className="shell-text-muted flex items-center gap-2 mt-2">
						<span>{formatDateJa(memo.updatedAt)}</span>
						{memo.memoTags && memo.memoTags.length > 0 && (
							<span>• {memo.memoTags.length} タグ</span>
						)}
					</div>
				</div>
			))}
		</div>
	);
};
