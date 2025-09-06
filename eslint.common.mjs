// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Common ESLint flat config shared by all workspaces
export default [
  { ignores: ['**/node_modules', '**/dist', '**/coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
]

