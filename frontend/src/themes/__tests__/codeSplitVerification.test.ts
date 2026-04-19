import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DIST_ASSETS = join(__dirname, '../../../dist/assets');

describe('14.1: コード分割成果物の検証', () => {
	it('dist/assets ディレクトリが存在すること（ビルド済みであること）', () => {
		expect(existsSync(DIST_ASSETS)).toBe(true);
	});

	it('MoriEffectLayer の独立チャンクが生成されること', () => {
		const files = readdirSync(DIST_ASSETS);
		const moriChunk = files.find((f) => f.startsWith('MoriEffectLayer') && f.endsWith('.js'));
		expect(moriChunk).toBeTruthy();
	});

	it('メインチャンクに useMoriEffectControl / useEditorFocusStore が含まれないこと', () => {
		const files = readdirSync(DIST_ASSETS);
		const indexChunk = files.find((f) => f.startsWith('index') && f.endsWith('.js'));
		expect(indexChunk).toBeTruthy();

		const content = readFileSync(join(DIST_ASSETS, indexChunk!), 'utf-8');
		expect(content).not.toContain('useMoriEffectControl');
		expect(content).not.toContain('useEditorFocusStore');
	});

	it('MoriEffectLayer チャンクに mori 専用制御ロジックが含まれること', () => {
		const files = readdirSync(DIST_ASSETS);
		const moriChunk = files.find((f) => f.startsWith('MoriEffectLayer') && f.endsWith('.js'));
		expect(moriChunk).toBeTruthy();

		const content = readFileSync(join(DIST_ASSETS, moriChunk!), 'utf-8');
		expect(content).toContain('shouldRun');
	});
});
