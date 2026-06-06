import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
	darkMode: 'class',
	theme: {
		extend: {
			// prose（@tailwindcss/typography）の既定スタイルを、エディタ／公開ビュー共通で調整する。
			// editor / public は同一の `prose` クラスを使うため、DEFAULT への一元定義で対称適用される。
			typography: {
				DEFAULT: {
					css: {
						// 本文幅の中央寄せ制限を解除し、現行レイアウト（mx-auto + 親幅）を維持する。
						maxWidth: 'none',

						// インラインコードのバッククォート擬似要素を無効化（` ` の二重表示を防ぐ）。
						'code::before': { content: 'none' },
						'code::after': { content: 'none' },

						// コードブロックの prose 既定（背景・文字色・余白）を無効化し、
						// codeHighlight.css（.rich-text-editor pre 等）の配色を優先させる。
						pre: {
							backgroundColor: 'unset',
							color: 'unset',
							padding: 0,
							margin: 0,
							borderRadius: 0,
						},
						'pre code': {
							backgroundColor: 'unset',
							color: 'unset',
							padding: 0,
							fontWeight: 'inherit',
						},

						// タスクリストの行頭バレット・インデントを抑止し、チェックボックスと二重化させない。
						'ul[data-type="taskList"]': {
							listStyleType: 'none',
							paddingLeft: 0,
							marginLeft: 0,
						},
						'ul[data-type="taskList"] > li': {
							paddingLeft: 0,
						},
						'ul[data-type="taskList"] > li::before': {
							content: 'none',
						},
					},
				},
			},
		},
	},
	plugins: [typography],
};
