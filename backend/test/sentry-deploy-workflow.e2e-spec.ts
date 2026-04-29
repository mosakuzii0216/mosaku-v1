import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflowPath = join(__dirname, '..', '..', '.github', 'workflows', 'deploy-backend.yml');
const workflow = readFileSync(workflowPath, 'utf8');

describe('deploy-backend.yml — Sentry release injection contract', () => {
	it('Cloud Run の --set-env-vars に Sentry 関連 env を投入する', () => {
		expect(workflow).toMatch(/SENTRY_RELEASE=\$\{\{\s*github\.sha\s*\}\}/);
		expect(workflow).toMatch(/SENTRY_ENVIRONMENT=production/);
		expect(workflow).toMatch(/SENTRY_TRACES_SAMPLE_RATE=0\.1/);
		expect(workflow).toMatch(/SENTRY_PROFILES_SAMPLE_RATE=0\.1/);
		expect(workflow).toMatch(/--(?:set|update)-env-vars/);
	});

	it('Sentry release ジョブが sentry-cli releases new / set-commits --auto / finalize を呼ぶ', () => {
		expect(workflow).toMatch(/@sentry\/cli/);
		expect(workflow).toMatch(/releases\s+new\s+\$\{\{\s*github\.sha\s*\}\}/);
		expect(workflow).toMatch(/set-commits\s+\$\{\{\s*github\.sha\s*\}\}\s+--auto/);
		expect(workflow).toMatch(/releases\s+finalize\s+\$\{\{\s*github\.sha\s*\}\}/);
	});

	it('release ジョブが新規 GitHub Secrets を参照できる env を定義する', () => {
		expect(workflow).toMatch(/SENTRY_AUTH_TOKEN:\s*\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/);
		expect(workflow).toMatch(/SENTRY_ORG:\s*\$\{\{\s*secrets\.SENTRY_ORG\s*\}\}/);
		expect(workflow).toMatch(
			/SENTRY_PROJECT(?:_BACKEND)?:\s*\$\{\{\s*secrets\.SENTRY_PROJECT_BACKEND\s*\}\}/,
		);
	});

	it('release ジョブは deploy ジョブの後に実行される', () => {
		expect(workflow).toMatch(/sentry-release[\s\S]*needs:\s*(?:\[\s*deploy[\s,\]]|deploy\b)/);
	});

	it('既存 SLACK_WEBHOOK_URL は CI 通知専用として残す', () => {
		expect(workflow).toMatch(/SLACK_WEBHOOK_URL:\s*\$\{\{\s*secrets\.SLACK_WEBHOOK_URL\s*\}\}/);
	});
});
