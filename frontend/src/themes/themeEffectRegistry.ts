import type { ComponentType } from 'react';
import type { ThemeEffectKey } from '../types/theme';

export type EffectLoader = () => Promise<{ default: ComponentType }>;

export const themeEffectRegistry: Record<ThemeEffectKey, EffectLoader> = {
	mori: () => import('../components/effects/mori/MoriEffectLayer'),
};

export function resolveThemeEffect(key: ThemeEffectKey | undefined): EffectLoader | null {
	if (!key) return null;
	return themeEffectRegistry[key] ?? null;
}
