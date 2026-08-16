import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { SlashCommandItem, SlashCommandMode } from './slashCommandItems';

interface SlashCommandListProps {
	items: SlashCommandItem[];
	/** 候補確定（root のノートブック参照はモード遷移、それ以外は挿入）。render 層が解釈する */
	command: (item: SlashCommandItem) => void;
	/** 表示モード。notebook のとき「戻る」操作を提供する */
	mode: SlashCommandMode;
	/** ノートブックサブメニューからルートへ戻る */
	onBack: () => void;
}

export interface SlashCommandListRef {
	onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean;
}

/**
 * スラッシュコマンド候補リストの presentational コンポーネント。
 *
 * 上下キー移動・Enter 確定・クリック選択・候補なし表示・ノートブックサブメニューの「戻る」に対応する（Req3.6/3.8）。
 * 既存の forwardRef + useImperativeHandle(onKeyDown) 構造を踏襲し、Suggestion 連携を維持する。
 */
export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
	({ items, command, mode, onBack }, ref) => {
		const [selectedIndex, setSelectedIndex] = useState(0);
		// キーボード操作は再レンダリングの完了を待たず同期で連続発火しうるため、
		// 選択位置の真実源泉は ref に置き、表示用 state と同期させる。
		const indexRef = useRef(0);
		const moveTo = (index: number) => {
			indexRef.current = index;
			setSelectedIndex(index);
		};

		// 候補が変わるたびに選択位置を先頭へ戻す
		useEffect(() => moveTo(0), [items]);

		const selectItem = (index: number) => {
			const item = items[index];
			if (item) {
				command(item);
			}
		};

		useImperativeHandle(ref, () => ({
			onKeyDown: ({ event }: { event: KeyboardEvent }) => {
				// 候補なしのときは確定・移動を無効化し、ProseMirror へ素通しする（Req3.8）
				if (items.length === 0) {
					return false;
				}

				if (event.key === 'ArrowUp') {
					moveTo((indexRef.current + items.length - 1) % items.length);
					return true;
				}

				if (event.key === 'ArrowDown') {
					moveTo((indexRef.current + 1) % items.length);
					return true;
				}

				if (event.key === 'Enter') {
					selectItem(indexRef.current);
					return true;
				}

				return false;
			},
		}));

		return (
			<div
				className="slash-command-list shell-popover overflow-hidden max-h-80 overflow-y-auto"
				role="listbox"
			>
				{mode !== 'root' && (
					<button
						type="button"
						onClick={onBack}
						className="shell-popover-item shell-text-muted block w-full text-left px-4 py-2"
					>
						← コマンドへ戻る
					</button>
				)}
				{items.length > 0 ? (
					items.map((item, index) => (
						<button
							key={`${item.kind}-${item.title}`}
							type="button"
							role="option"
							aria-selected={index === selectedIndex}
							className="shell-popover-item flex items-center gap-2 w-full text-left px-4 py-2"
							onClick={() => selectItem(index)}
						>
							{item.swatchColorVar && (
								<span
									data-slash-swatch=""
									className="inline-block w-4 h-4 rounded-full border border-[var(--outline)] shrink-0"
									style={{ backgroundColor: `var(${item.swatchColorVar})` }}
								/>
							)}
							<div>
								<div className="font-medium">{item.title}</div>
								{item.description && (
									<div className="shell-text-muted mt-0.5">{item.description}</div>
								)}
							</div>
						</button>
					))
				) : (
					<div className="shell-text-muted px-4 py-2">該当するコマンドがありません</div>
				)}
			</div>
		);
	},
);

SlashCommandList.displayName = 'SlashCommandList';
