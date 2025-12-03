import { useState, useEffect } from 'react';

type PaletteMode = 'notebook-select' | 'memo-select';

export const useMemoPalette = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [mode, setMode] = useState<PaletteMode>('memo-select');

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd/Ctrl + K: メモ選択パレット
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				setMode('memo-select');
				setIsOpen(true);
			}

			// Cmd/Ctrl + P: ノートブック選択パレット（2段階）
			if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
				e.preventDefault();
				setMode('notebook-select');
				setIsOpen(true);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	const openPalette = (paletteMode: PaletteMode = 'memo-select') => {
		setMode(paletteMode);
		setIsOpen(true);
	};

	const closePalette = () => {
		setIsOpen(false);
	};

	return {
		isOpen,
		mode,
		openPalette,
		closePalette,
	};
};
