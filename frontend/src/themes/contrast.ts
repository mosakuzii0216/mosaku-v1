/*
 * contrast.ts — WCAG 2.1 コントラスト計算 + CSS ブロック抽出の共有ユーティリティ
 * ============================================================================
 * `tokens.contrast.test.ts`（shell トークン）と `editorPalette.contrast.test.ts`
 * （editor セマンティックパレット）が共通で使う AA 機械検証の基盤。
 * 元は `tokens.contrast.test.ts` にインライン定義されていたが、editor セマンティック
 * パレットの AA 検証にも同じ計算群が必要になったため共有ユーティリティへ抽出した
 * （rich-editor-blocks Task 2.1・重複排除）。
 */

export interface RGBA {
	r: number;
	g: number;
	b: number;
	a: number;
}

/** CSS コメント（ブロックコメント）を除去する */
export function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** ブレースの深さを数えて、ヘッダーにマッチするトップレベルブロックの中身を丸ごと取り出す */
export function findBlock(input: string, headerPattern: RegExp): string | null {
	const match = input.match(headerPattern);
	if (!match || match.index === undefined) return null;
	const braceStart = input.indexOf('{', match.index);
	if (braceStart === -1) return null;
	let depth = 0;
	for (let i = braceStart; i < input.length; i++) {
		if (input[i] === '{') depth += 1;
		else if (input[i] === '}') {
			depth -= 1;
			if (depth === 0) return input.slice(braceStart + 1, i);
		}
	}
	return null;
}

/** ブロック中の `<name>: <value>;` を1件取り出す */
export function extractVar(block: string, name: string): string | null {
	const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
	return m ? m[1].trim() : null;
}

/** `#hex` / `rgb()` / `rgba()` を RGBA へパースする */
export function parseColor(input: string): RGBA {
	const s = input.trim();

	const hex = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
	if (hex) {
		let h = hex[1];
		if (h.length === 3)
			h = h
				.split('')
				.map((c) => c + c)
				.join('');
		return {
			r: parseInt(h.slice(0, 2), 16),
			g: parseInt(h.slice(2, 4), 16),
			b: parseInt(h.slice(4, 6), 16),
			a: 1,
		};
	}

	// rgb() / rgba()。カンマ区切り・スペース/スラッシュ区切りの両方を許容
	const rgb = s.match(/^rgba?\(([^)]+)\)$/);
	if (rgb) {
		const parts = rgb[1]
			.split(/[,/\s]+/)
			.map((p) => p.trim())
			.filter(Boolean);
		const [r, g, b, a] = parts;
		return { r: Number(r), g: Number(g), b: Number(b), a: a === undefined ? 1 : Number(a) };
	}

	throw new Error(`parseColor: 認識できない色 "${input}"`);
}

/** 半透明 fg を不透明な床 bg の上に合成して不透明色にする */
export function compositeOver(fg: RGBA, bg: RGBA): RGBA {
	const a = fg.a;
	return {
		r: a * fg.r + (1 - a) * bg.r,
		g: a * fg.g + (1 - a) * bg.g,
		b: a * fg.b + (1 - a) * bg.b,
		a: 1,
	};
}

export function relativeLuminance({ r, g, b }: RGBA): number {
	const lin = (c: number): number => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(c1: RGBA, c2: RGBA): number {
	const l1 = relativeLuminance(c1);
	const l2 = relativeLuminance(c2);
	const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
	return (hi + 0.05) / (lo + 0.05);
}
