import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { makeBase } from '../eslint.common.mjs';

export default [
	...makeBase(js, tseslint),
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
		},
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
			// 現状のコードベースに合わせて一部ルールを緩和（段階的に厳格化予定）
			'@typescript-eslint/no-explicit-any': 'warn',
			'no-useless-catch': 'warn',
			'@typescript-eslint/no-unused-expressions': [
				'warn',
				{ allowShortCircuit: true, allowTernary: true },
			],
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			'no-fallthrough': 'warn',
		},
	},
	// Node/CommonJS scripts under scripts/**
	{
		files: ['scripts/**/*.{js,cjs,mjs}'],
		languageOptions: {
			globals: globals.node,
			sourceType: 'commonjs',
		},
		rules: {
			// Allow require() in CJS utility scripts
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{ ignores: ['dist', 'dev-dist'] },
];
