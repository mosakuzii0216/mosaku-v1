import type { ComponentType } from 'react';
import type { ThemeEffectKey } from '../types/theme';

export type EffectLoader = () => Promise<{ default: ComponentType }>;

export const themeEffectRegistry: Record<ThemeEffectKey, EffectLoader> = {
	mori: () => import('../components/effects/mori/MoriEffectLayer'),
	umi: () => import('../components/effects/umi/UmiEffectLayer'),
	yoru: () => import('../components/effects/yoru/YoruEffectLayer'),
	asa: () => import('../components/effects/asa/AsaEffectLayer'),
};

export function resolveThemeEffect(key: ThemeEffectKey | undefined): EffectLoader | null {
	if (!key) return null;
	return themeEffectRegistry[key] ?? null;
}
