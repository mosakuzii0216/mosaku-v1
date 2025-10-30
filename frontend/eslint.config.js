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
