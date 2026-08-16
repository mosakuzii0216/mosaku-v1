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

	it('useMoriEffectControl が独立チャンクとして分割されること', () => {
		// Vite はコード分割された chunk のファイル名をメインチャンクのアセットマニフェストに埋め込む。
		// そのため "useMoriEffectControl" という文字列はメインチャンク内にもパス参照として現れる（正常動作）。
		// 実装コードの分離は「独立チャンクファイルが存在すること」で検証する。
		//
		// useEditorFocusStore は SwAutoUpdater → useGuardedAutoUpdate 経由でメインチャンクに含まれる（正常）。
		const files = readdirSync(DIST_ASSETS);
		const moriControlChunk = files.find(
			(f) => f.startsWith('useMoriEffectControl') && f.endsWith('.js'),
		);
		expect(moriControlChunk).toBeTruthy();
	});

	it('MoriEffectLayer チャンクに mori 専用制御ロジックが含まれること', () => {
		const files = readdirSync(DIST_ASSETS);
		const moriChunk = files.find((f) => f.startsWith('MoriEffectLayer') && f.endsWith('.js'));
		expect(moriChunk).toBeTruthy();

		const content = readFileSync(join(DIST_ASSETS, moriChunk!), 'utf-8');
		expect(content).toContain('shouldRun');
	});
});
