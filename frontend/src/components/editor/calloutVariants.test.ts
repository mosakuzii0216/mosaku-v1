import { describe, it, expect } from 'vitest';
import {
	CALLOUT_VARIANTS,
	DEFAULT_CALLOUT_VARIANT,
	resolveCalloutVariant,
} from './calloutVariants';

describe('calloutVariants（Task 4.1: コールアウト種別レジストリ）', () => {
	it('少なくとも point / warning の2種別を提供する（Req1.2）', () => {
		const names = CALLOUT_VARIANTS.map((v) => v.name);
		expect(names).toContain('point');
		expect(names).toContain('warning');
		expect(CALLOUT_VARIANTS.length).toBeGreaterThanOrEqual(2);
	});

	it('既定 variant は point', () => {
		expect(DEFAULT_CALLOUT_VARIANT).toBe('point');
	});

	it('既知 variant はそのまま解決する', () => {
		expect(resolveCalloutVariant('warning').name).toBe('warning');
	});

	it('未知 variant は既定（point）へフォールバックする（前方互換）', () => {
		expect(resolveCalloutVariant('mystery-variant').name).toBe('point');
	});

	it('null/undefined は既定（point）へフォールバックする', () => {
		expect(resolveCalloutVariant(null).name).toBe('point');
		expect(resolveCalloutVariant(undefined).name).toBe('point');
	});
});
