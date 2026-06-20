import { describe, it, expect } from 'vitest';
import { resolveThemeEffect, themeEffectRegistry } from './themeEffectRegistry';
import type { ThemeEffectKey } from '../types/theme';

describe('themeEffectRegistry', () => {
	it('should have an entry for "mori"', () => {
		expect(themeEffectRegistry.mori).toBeDefined();
		expect(typeof themeEffectRegistry.mori).toBe('function');
	});

	it('should have an entry for "umi"', () => {
		expect(themeEffectRegistry.umi).toBeDefined();
		expect(typeof themeEffectRegistry.umi).toBe('function');
	});
});

describe('resolveThemeEffect', () => {
	it('should return a loader for "mori"', () => {
		const loader = resolveThemeEffect('mori');
		expect(loader).not.toBeNull();
		expect(typeof loader).toBe('function');
	});

	it('should return a loader for "umi"', () => {
		const loader = resolveThemeEffect('umi');
		expect(loader).not.toBeNull();
		expect(typeof loader).toBe('function');
	});

	it('should return null for undefined', () => {
		const loader = resolveThemeEffect(undefined);
		expect(loader).toBeNull();
	});

	it('should return null for unknown effect key', () => {
		const loader = resolveThemeEffect('unknown-key' as ThemeEffectKey);
		expect(loader).toBeNull();
	});
});
