import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SlashCommandList, type SlashCommandListRef } from './SlashCommandList';
import type { SlashCommandItem } from './slashCommandItems';

function makeItems(titles: string[]): SlashCommandItem[] {
	return titles.map((title) => ({ title, kind: 'block' as const, run: vi.fn() }));
}

const key = (k: string) => ({ event: new KeyboardEvent('keydown', { key: k }) });

describe('SlashCommandList', () => {
	beforeEach(() => cleanup());

	describe('候補の描画と選択（Req3.6）', () => {
		it('候補リストを描画する', () => {
			render(
				<SlashCommandList
					items={makeItems(['見出し1', '箇条書き'])}
					command={vi.fn()}
					mode="root"
					onBack={vi.fn()}
				/>,
			);
			expect(screen.getByText('見出し1')).toBeTruthy();
			expect(screen.getByText('箇条書き')).toBeTruthy();
		});

		it('クリックで該当コマンドを command に渡す', () => {
			const command = vi.fn();
			const items = makeItems(['見出し1', '箇条書き']);
			render(<SlashCommandList items={items} command={command} mode="root" onBack={vi.fn()} />);
			fireEvent.click(screen.getByText('箇条書き'));
			expect(command).toHaveBeenCalledWith(items[1]);
		});

		it('Enter で現在の選択（初期は先頭）を確定する', () => {
			const command = vi.fn();
			const items = makeItems(['見出し1', '箇条書き']);
			const ref = createRef<SlashCommandListRef>();
			render(
				<SlashCommandList ref={ref} items={items} command={command} mode="root" onBack={vi.fn()} />,
			);
			expect(ref.current!.onKeyDown(key('Enter'))).toBe(true);
			expect(command).toHaveBeenCalledWith(items[0]);
		});

		it('ArrowDown→Enter で次の候補を確定する', () => {
			const command = vi.fn();
			const items = makeItems(['見出し1', '箇条書き']);
			const ref = createRef<SlashCommandListRef>();
			render(
				<SlashCommandList ref={ref} items={items} command={command} mode="root" onBack={vi.fn()} />,
			);
			expect(ref.current!.onKeyDown(key('ArrowDown'))).toBe(true);
			ref.current!.onKeyDown(key('Enter'));
			expect(command).toHaveBeenCalledWith(items[1]);
		});

		it('ArrowUp は末尾へ巡回する', () => {
			const command = vi.fn();
			const items = makeItems(['A', 'B', 'C']);
			const ref = createRef<SlashCommandListRef>();
			render(
				<SlashCommandList ref={ref} items={items} command={command} mode="root" onBack={vi.fn()} />,
			);
			ref.current!.onKeyDown(key('ArrowUp'));
			ref.current!.onKeyDown(key('Enter'));
			expect(command).toHaveBeenCalledWith(items[2]);
		});

		it('未対応キーでは false を返し ProseMirror へ素通しする', () => {
			const ref = createRef<SlashCommandListRef>();
			render(
				<SlashCommandList
					ref={ref}
					items={makeItems(['A'])}
					command={vi.fn()}
					mode="root"
					onBack={vi.fn()}
				/>,
			);
			expect(ref.current!.onKeyDown(key('a'))).toBe(false);
		});
	});

	describe('候補なし表示（Req3.8）', () => {
		it('候補が空のとき「該当するコマンドがありません」を表示する', () => {
			render(<SlashCommandList items={[]} command={vi.fn()} mode="root" onBack={vi.fn()} />);
			expect(screen.getByText('該当するコマンドがありません')).toBeTruthy();
		});

		it('候補が空のとき Enter は何も確定せず false を返す', () => {
			const command = vi.fn();
			const ref = createRef<SlashCommandListRef>();
			render(
				<SlashCommandList ref={ref} items={[]} command={command} mode="root" onBack={vi.fn()} />,
			);
			expect(ref.current!.onKeyDown(key('Enter'))).toBe(false);
			expect(command).not.toHaveBeenCalled();
		});
	});

	describe('ノートブックサブメニューと戻る操作（Req3.5/3.8）', () => {
		it('mode=notebook では「戻る」操作を提供し onBack を呼ぶ', () => {
			const onBack = vi.fn();
			render(
				<SlashCommandList
					items={makeItems(['日記'])}
					command={vi.fn()}
					mode="notebook"
					onBack={onBack}
				/>,
			);
			const backButton = screen.getByRole('button', { name: /戻る/ });
			fireEvent.click(backButton);
			expect(onBack).toHaveBeenCalled();
		});

		it('mode=root では「戻る」操作を表示しない', () => {
			render(
				<SlashCommandList
					items={makeItems(['見出し1'])}
					command={vi.fn()}
					mode="root"
					onBack={vi.fn()}
				/>,
			);
			expect(screen.queryByRole('button', { name: /戻る/ })).toBeNull();
		});
	});

	describe('palette サブメニュー（Task 7.2・Req5.3）', () => {
		it('mode=palette では「戻る」操作を提供し onBack を呼ぶ', () => {
			const onBack = vi.fn();
			render(
				<SlashCommandList
					items={makeItems(['若葉'])}
					command={vi.fn()}
					mode="palette"
					onBack={onBack}
				/>,
			);
			const backButton = screen.getByRole('button', { name: /戻る/ });
			fireEvent.click(backButton);
			expect(onBack).toHaveBeenCalled();
		});

		it('swatchColorVar を持つ項目は色見本（背景色に CSS 変数）を描画する', () => {
			const items: SlashCommandItem[] = [
				{
					title: '若葉',
					kind: 'palette',
					swatchColorVar: '--editor-text-wakaba',
					run: vi.fn(),
				},
			];
			render(<SlashCommandList items={items} command={vi.fn()} mode="palette" onBack={vi.fn()} />);
			const swatch = document.querySelector('[data-slash-swatch]') as HTMLElement | null;
			expect(swatch).not.toBeNull();
			expect(swatch?.style.backgroundColor).toBe('var(--editor-text-wakaba)');
		});
	});
});
