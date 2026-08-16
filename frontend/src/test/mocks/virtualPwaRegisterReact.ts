/**
 * vitest 専用スタブ: 本番では vite-plugin-pwa が `virtual:pwa-register/react`
 * を提供するが、テスト環境ではモジュール解決が成立しないため、
 * vitest.config.ts の alias から本ファイルへリダイレクトしている。
 *
 * 実テストはここを vi.mock(...) で上書きして個別の挙動を差し替える。
 */
import { vi } from 'vitest';

export interface RegisterSWOptions {
	immediate?: boolean;
	onNeedRefresh?: () => void;
	onOfflineReady?: () => void;
	onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
	onRegisterError?: (error: unknown) => void;
}

export const useRegisterSW = vi.fn(() => ({
	needRefresh: [false, vi.fn()] as [boolean, (v: boolean) => void],
	offlineReady: [false, vi.fn()] as [boolean, (v: boolean) => void],
	updateServiceWorker: vi.fn(async () => {}),
}));
