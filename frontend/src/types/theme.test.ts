import { describe, it, expect } from 'vitest';
import type { ThemeEffectKey, ThemeMetadata, Theme } from './theme';
import { getEffectKey } from './theme';

describe('ThemeEffectKey', () => {
	it('should accept "mori" as a valid effect key', () => {
		const key: ThemeEffectKey = 'mori';
		expect(key).toBe('mori');
	});

	it('should accept "umi" as a valid effect key', () => {
		const key: ThemeEffectKey = 'umi';
		expect(key).toBe('umi');
	});
});

describe('ThemeMetadata', () => {
	it('should allow effectKey to be set', () => {
		const metadata: ThemeMetadata = { effectKey: 'mori' };
		expect(metadata.effectKey).toBe('mori');
	});

	it('should allow effectKey to be undefined', () => {
		const metadata: ThemeMetadata = {};
		expect(metadata.effectKey).toBeUndefined();
	});

	it('should allow arbitrary additional keys', () => {
		const metadata: ThemeMetadata = { effectKey: 'mori', someOtherKey: 'value' };
		expect(metadata.someOtherKey).toBe('value');
	});
});

describe('getEffectKey', () => {
	it('should return effectKey when metadata contains a valid effectKey', () => {
		const theme = { metadata: { effectKey: 'mori' } } as Theme;
		expect(getEffectKey(theme)).toBe('mori');
	});

	it('should return "umi" when metadata contains effectKey "umi"', () => {
		const theme = { metadata: { effectKey: 'umi' } } as Theme;
		expect(getEffectKey(theme)).toBe('umi');
	});

	it('should return undefined when metadata has no effectKey', () => {
		const theme = { metadata: {} } as Theme;
		expect(getEffectKey(theme)).toBeUndefined();
	});

	it('should return undefined when metadata is undefined', () => {
		const theme = {} as Theme;
		expect(getEffectKey(theme)).toBeUndefined();
	});

	it('should return undefined for unknown effectKey values', () => {
		const theme = { metadata: { effectKey: 'unknown-key' } } as unknown as Theme;
		expect(getEffectKey(theme)).toBeUndefined();
	});

	it('should return undefined when theme is null', () => {
		expect(getEffectKey(null)).toBeUndefined();
	});
});
