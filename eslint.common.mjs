// @ts-check
// Common ESLint flat config factory to avoid requiring dependencies at repo root
/**
 * @param {*} js Module from '@eslint/js'
 * @param {*} tseslint Module from 'typescript-eslint'
 */
export function makeBase(js, tseslint) {
  return [
    { ignores: ['**/node_modules', '**/dist', '**/coverage'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
  ]
}
