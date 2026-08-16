import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'.github',
	'workflows',
	'deploy-frontend-prod.yml',
);
const workflow = readFileSync(workflowPath, 'utf8');

describe('deploy-frontend-prod.yml — Sentry env injection contract', () => {
	it('build-check ジョブの env に Sentry 関連 env を export する', () => {
		const buildCheckBlock = extractJobBlock(workflow, 'build-check');
		expect(buildCheckBlock).toMatch(/VITE_SENTRY_RELEASE:\s*\$\{\{\s*github\.sha\s*\}\}/);
		expect(buildCheckBlock).toMatch(
			/SENTRY_AUTH_TOKEN:\s*\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/,
		);
		expect(buildCheckBlock).toMatch(/SENTRY_ORG:\s*\$\{\{\s*secrets\.SENTRY_ORG\s*\}\}/);
		expect(buildCheckBlock).toMatch(
			/SENTRY_PROJECT:\s*\$\{\{\s*secrets\.SENTRY_PROJECT_FRONTEND\s*\}\}/,
		);
	});

	it('deploy ジョブの env にも同じ Sentry 関連 env を export する', () => {
		const deployBlock = extractJobBlock(workflow, 'deploy');
		expect(deployBlock).toMatch(/VITE_SENTRY_RELEASE:\s*\$\{\{\s*github\.sha\s*\}\}/);
		expect(deployBlock).toMatch(/SENTRY_AUTH_TOKEN:\s*\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/);
		expect(deployBlock).toMatch(/SENTRY_ORG:\s*\$\{\{\s*secrets\.SENTRY_ORG\s*\}\}/);
		expect(deployBlock).toMatch(
			/SENTRY_PROJECT:\s*\$\{\{\s*secrets\.SENTRY_PROJECT_FRONTEND\s*\}\}/,
		);
	});

	it('build-check に dist/**/*.map が公開物に残らないことを検証する post-check ステップを置く', () => {
		const buildCheckBlock = extractJobBlock(workflow, 'build-check');
		// `find dist -name "*.map"` で結果が空であることを確認、残っていれば exit 1 する設計
		expect(buildCheckBlock).toMatch(/dist[\s\S]*\.map/);
		expect(buildCheckBlock).toMatch(/exit\s+1/);
	});
});

function extractJobBlock(yaml: string, jobName: string): string {
	const lines = yaml.split('\n');
	const startIdx = lines.findIndex((line) => new RegExp(`^\\s{2}${jobName}:\\s*$`).test(line));
	if (startIdx < 0) {
		throw new Error(`Job '${jobName}' not found in workflow`);
	}
	const endIdx = lines.findIndex(
		(line, idx) => idx > startIdx && /^\s{2}[a-zA-Z][\w-]*:\s*$/.test(line),
	);
	const slice = endIdx < 0 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx);
	return slice.join('\n');
}
