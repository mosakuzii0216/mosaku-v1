import { useState, useEffect, useRef, useMemo } from 'react';
import { useNotebooks } from '../../hooks/useNotebookQueries';
import { useMemos } from '../../hooks/useMemoQueries';
import { useMemoStore } from '../../stores/useMemoStore';
import type { Memo } from '../../types/memo';

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

	const { goToEdit } = useMemoStore();
	const { data: notebooks = [] } = useNotebooks();
	const { data: memos = [] } = useMemos();

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
			nb.name?.toLowerCase().includes(searchQuery.toLowerCase())
		);

		return [
			{ id: 'ALL', name: 'すべてのメモ', isSpecial: true },
			{ id: 'INBOX', name: '未選択', isSpecial: true },
			...filteredNotebooks.map((nb) => ({ ...nb, isSpecial: false })),
		];
	}, [notebooks, searchQuery]);

	// フィルタリングされたメモ一覧（useMemoで最適化）
	const filteredMemos = useMemo(() => {
		console.log('[MemoPalette] Filtering memos:', {
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
				return (
					memo.title.toLowerCase().includes(query) ||
					memo.content.toLowerCase().includes(query)
				);
			}

			return true;
		});

		console.log('[MemoPalette] Filtered result:', {
			filteredCount: filtered.length,
			filtered: filtered.slice(0, 3).map(m => ({ id: m.id, title: m.title, notebookId: m.notebookId })),
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
						const selected = items[selectedIndex] as typeof notebookOptions[0];
						console.log('[MemoPalette] Notebook selected:', selected);
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
	}, [isOpen, mode, selectedIndex, notebookOptions, filteredMemos, selectedNotebookId, initialMode, goToEdit, onClose]);

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
			<div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

			{/* パレット本体 */}
			<div className="relative w-full max-w-2xl mx-4 bg-white rounded-lg shadow-2xl overflow-hidden">
				{/* 検索入力 */}
				<div className="p-4 border-b border-gray-200">
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
						className="w-full px-4 py-2 text-lg border-none outline-none bg-transparent"
					/>
				</div>

				{/* ノートブックフィルタ（memo-selectモード時のみ） */}
				{mode === 'memo-select' && (
					<div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
						<span className="text-sm text-gray-600">ノートブック:</span>
						<button
							onClick={() => {
								if (initialMode === 'notebook-select') {
									setMode('notebook-select');
									setSelectedNotebookId(null);
								}
							}}
							className="text-sm px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
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
				<div className="max-h-96 overflow-y-auto">
					{mode === 'notebook-select' ? (
						<NotebookList
							notebooks={notebookOptions}
							selectedIndex={selectedIndex}
							onSelect={(nb) => {
								console.log('[MemoPalette] Notebook clicked:', nb);
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
				<div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
					<div className="flex gap-4">
						<span>
							<kbd className="px-1 py-0.5 bg-white border rounded">↑↓</kbd> 選択
						</span>
						<span>
							<kbd className="px-1 py-0.5 bg-white border rounded">Enter</kbd> 決定
						</span>
						<span>
							<kbd className="px-1 py-0.5 bg-white border rounded">Esc</kbd> 閉じる
						</span>
					</div>
					{mode === 'memo-select' && (
						<div className="text-gray-400">
							{filteredMemos.length} 件のメモ
						</div>
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
		return (
			<div className="p-8 text-center text-gray-500">
				ノートブックが見つかりません
			</div>
		);
	}

	return (
		<div ref={listRef}>
			{notebooks.map((nb, index) => (
				<div
					key={nb.id}
					onClick={() => onSelect(nb)}
					className={`px-4 py-3 cursor-pointer transition-colors ${
						index === selectedIndex
							? 'bg-blue-50 border-l-4 border-blue-500'
							: 'hover:bg-gray-50 border-l-4 border-transparent'
					}`}
				>
					<div className="font-medium text-gray-900">
						{nb.name || '(名称未設定)'}
					</div>
					{nb.isSpecial && (
						<div className="text-xs text-gray-500 mt-1">
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
		return (
			<div className="p-8 text-center text-gray-500">
				メモが見つかりません
			</div>
		);
	}

	return (
		<div ref={listRef}>
			{memos.map((memo, index) => (
				<div
					key={memo.id}
					onClick={() => onSelect(memo)}
					className={`px-4 py-3 cursor-pointer transition-colors ${
						index === selectedIndex
							? 'bg-blue-50 border-l-4 border-blue-500'
							: 'hover:bg-gray-50 border-l-4 border-transparent'
					}`}
				>
					<div className="font-medium text-gray-900">{memo.title || '無題'}</div>
					{memo.content && (
						<div className="text-sm text-gray-600 mt-1 line-clamp-2">
							{memo.content.replace(/<[^>]*>/g, '').substring(0, 100)}
						</div>
					)}
					<div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
						<span>{new Date(memo.updatedAt).toLocaleDateString('ja-JP')}</span>
						{memo.memoTags && memo.memoTags.length > 0 && (
							<span>• {memo.memoTags.length} タグ</span>
						)}
					</div>
				</div>
			))}
		</div>
	);
};
