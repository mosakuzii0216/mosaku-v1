# API障害監視ツール 構想メモ

> 別の新規リポジトリとして実装予定のツールの設計メモ。
> mosaku プロジェクト本体とは独立した、汎用的な API ステータス監視 + 影響判定ツール。

## 背景・解決したいこと

利用している外部 API（OpenAI / Slack / LINE 等）の障害情報を **5分以内** に検知し、自プロジェクトへの影響を自動で判定したい。

### 課題

- ステータスページを毎日手動でチェックするのは非現実的
- サービスごとに API の形式（StatusPage、独自 API、HTML）が違うので、サービス別パーサーを書くのは保守地獄
- 障害が起きても「自分のプロジェクトに関係あるか？」を毎回考えるのが面倒

### ゴール

**「URL を1行追加するだけで監視対象を増やせる、汎用的な監視ツール」** を作る。

---

## ブレインストーミングで確定した方針

| 項目           | 採用                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| 基盤           | **GitHub Actions**（最短5分cron、最悪10〜20分の遅延は許容）                  |
| 監視方式       | **汎用ポーリング**（サービス別 API は使わない、HTML経由で統一）              |
| 本文抽出       | **`@mozilla/readability`**（Firefox リーダーモード相当）                     |
| 差分検知       | **SHA-256 ハッシュ比較**（ノイズ除去後）                                     |
| 状態保存       | **`state/hashes.json` を repo にコミット**（DBなし）                         |
| 影響判定       | **Claude API**（`claude-haiku-4-5` + Tool Use で構造化出力）                 |
| コスト最適化   | **ハッシュ一致時は Claude を呼ばない**（通常時 $0、障害時のみ課金）          |
| 通知方式       | **GitHub Issue 作成 → GitHub Slack 公式インテグレーション経由で Slack 通知** |
| Issue 方針     | **影響あり/なし両方を Issue 化**（証跡として価値）                           |
| Issue タイトル | `[調査結果：影響あり/なし] {サービス名}の障害（{要約}）`                     |

### 検討して **却下** したもの

- ❌ Cloudflare Workers / Vercel Cron（信頼性は高いが、まずは手軽な GitHub Actions で十分）
- ❌ Webhook 受信方式（受け口立てるコスト高い、ポーリングで足りる）
- ❌ サービスごとの専用パーサー（保守地獄、汎用パイプラインで吸収）
- ❌ 「影響あり」のみ Issue 化（証跡を残したいので両方作る）
- ❌ LINE Notify（2025年3月で終了済み）

---

## 全体アーキテクチャ

```
┌─ GitHub Actions cron（*/5 * * * *）───────────────────┐
│                                                       │
│  config/sources.yml の URL リストをループ             │
│    ↓                                                  │
│  ① fetch(url) + ETag/If-None-Match                    │
│    ↓ 304 ならスキップ                                 │
│  ② Readability で本文抽出 → ノイズ除去 → ハッシュ計算 │
│    ↓                                                  │
│  ③ state/hashes.json と比較                           │
│    ↓ 一致なら何もしない（コスト $0）                  │
│    ↓ 差分あり                                         │
│  ④ Claude（haiku-4-5）に投げる                        │
│     - 入力: プロジェクト概要 + 抽出済み本文           │
│     - Tool Use で構造化JSON強制                       │
│    ↓                                                  │
│  ⑤ Octokit で Issue 作成                              │
│     - タイトル: [調査結果：影響あり/なし] ...         │
│     - ラベル: incident / impact:yes|no / service:xxx  │
│    ↓                                                  │
│  ⑥ state/hashes.json を更新 → コミット → push         │
│                                                       │
└───────────────────────────────────────────────────────┘
            ↓
   GitHub の Slack 公式インテグレーション
   （`/github subscribe owner/repo issues` で設定）
            ↓
        Slack #incidents チャンネルに自動投稿
```

---

## リポジトリ構成（新規作成予定）

```
api-watcher/                          # 新規リポジトリ
├── .github/
│   └── workflows/
│       └── watch.yml                 # 5分おきcron
├── src/
│   ├── index.ts                      # エントリポイント（オーケストレーション）
│   ├── extract.ts                    # URL → 本文抽出 + ハッシュ
│   ├── claude.ts                     # Claude API 呼び出し（Tool Use）
│   ├── github.ts                     # Issue 作成
│   ├── state.ts                      # hashes.json 読み書き
│   └── types.ts                      # 型定義
├── config/
│   ├── sources.yml                   # 監視URL一覧
│   └── project.md                    # ★ Claude に渡す「守りたいプロジェクト」の説明
├── state/
│   └── hashes.json                   # 各URLの前回ハッシュ（コミット対象）
├── package.json
├── tsconfig.json
└── README.md
```

### `config/project.md` とは何か（補足）

このファイルは **「監視対象のプロジェクト（=守りたい側のプロジェクト）の説明書」**。
Claude が「障害情報→自分のプロジェクトへの影響」を判定するための **唯一の根拠** となる。

例：

- `project.md` に「OpenAI は GPT-4 でテキスト補完のみ使用、画像生成は未使用」と書いておく
- ステータスページに「DALL-E 3 でエラー」と出た場合 → Claude が「画像生成は未使用なので影響なし」と判定できる

これがないと、Claude は「影響あるかどうか」を判断する材料がないので、汎用判定が成立しない。

---

## URL から「要件だけ」を抽出する仕組み

### 採用ライブラリ

- **`@mozilla/readability`** — Firefox の「リーダーモード」と同じ本文抽出ロジック
- **`jsdom`** — Node.js で DOM をパースするため

### `src/extract.ts` の実装イメージ

```ts
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';

export type ExtractResult = {
	content: string;
	hash: string;
	etag: string | null;
};

export async function extract(url: string, prevEtag?: string): Promise<ExtractResult | null> {
	const res = await fetch(url, {
		headers: prevEtag ? { 'If-None-Match': prevEtag } : {},
	});

	// 1. 更新なし → 早期 return
	if (res.status === 304) return null;

	const html = await res.text();
	const etag = res.headers.get('etag');

	// 2. Readability で本文だけ抽出（nav/footer/script/ads が消える）
	const dom = new JSDOM(html, { url });
	const article = new Readability(dom.window.document).parse();
	const text = article?.textContent ?? dom.window.document.body.textContent ?? '';

	// 3. ノイズ除去
	const cleaned = text
		.replace(/\d+\s*(seconds?|minutes?|hours?|days?)\s*ago/gi, '')
		.replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, '') // ISO 8601
		.replace(/\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|UTC|JST)?/gi, '')
		.replace(/\s+/g, ' ')
		.trim();

	// 4. SHA-256 ハッシュ
	const hash = createHash('sha256').update(cleaned).digest('hex');

	return { content: cleaned, hash, etag };
}
```

### なぜこれが汎用なのか

- StatusPage / Slack 独自 / LINE のお知らせページ、**HTML として返ってくるなら何でも処理可能**
- 監視対象追加は `config/sources.yml` に URL を1行追加するだけ
- JSON API（OpenAI の `/api/v2/incidents.json` 等）も使えるが、**HTML パスで統一** することで実装を簡素化

### `config/sources.yml` の例

```yaml
sources:
  - id: openai
    name: OpenAI
    url: https://status.openai.com
  - id: slack
    name: Slack
    url: https://status.slack.com
  - id: line
    name: LINE
    url: https://www.line-status.com # 要事前確認、最適なURLに調整
```

---

## GitHub Actions での具体実装

### `.github/workflows/watch.yml`

```yaml
name: API Watcher

on:
  schedule:
    - cron: '*/5 * * * *' # 5分おき（最小単位、混雑時は遅延あり）
  workflow_dispatch: # 手動実行も可能

permissions:
  contents: write # state/hashes.json のコミットに必要
  issues: write # Issue 作成に必要

concurrency:
  group: api-watcher
  cancel-in-progress: false # 前回実行が遅延しててもキャンセルしない

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - run: npm ci

      - name: Run watcher
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
        run: npm run check

      - name: Commit state changes
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add state/hashes.json
          if ! git diff --cached --quiet; then
            git commit -m "chore: update hashes ($(date -u +%FT%TZ))"
            git push
          fi
```

### `src/claude.ts`（Tool Use で構造化出力）

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export type Analysis = {
	is_incident: boolean;
	severity: 'none' | 'minor' | 'major' | 'critical';
	affects_my_project: boolean;
	affected_features: string[];
	title: string;
	summary: string;
	action_needed: string;
};

export async function analyze(
	serviceName: string,
	url: string,
	content: string,
	projectDescription: string,
): Promise<Analysis> {
	const res = await client.messages.create({
		model: 'claude-haiku-4-5',
		max_tokens: 1024,
		system: [
			{
				type: 'text',
				text: `あなたはAPIインシデント分析アシスタントです。\n\n【プロジェクト概要】\n${projectDescription}`,
				cache_control: { type: 'ephemeral' }, // プロジェクト説明をキャッシュ
			},
		],
		tools: [
			{
				name: 'report_analysis',
				description: 'インシデント分析結果を構造化して報告する',
				input_schema: {
					type: 'object',
					properties: {
						is_incident: { type: 'boolean' },
						severity: { type: 'string', enum: ['none', 'minor', 'major', 'critical'] },
						affects_my_project: { type: 'boolean' },
						affected_features: { type: 'array', items: { type: 'string' } },
						title: { type: 'string' },
						summary: { type: 'string' },
						action_needed: { type: 'string' },
					},
					required: [
						'is_incident',
						'severity',
						'affects_my_project',
						'title',
						'summary',
						'action_needed',
					],
				},
			},
		],
		tool_choice: { type: 'tool', name: 'report_analysis' },
		messages: [
			{
				role: 'user',
				content: `サービス: ${serviceName}\nURL: ${url}\n\nページ本文:\n${content}`,
			},
		],
	});

	const toolUse = res.content.find((b) => b.type === 'tool_use');
	if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool_use in response');
	return toolUse.input as Analysis;
}
```

### `src/github.ts`（Issue 作成）

```ts
import { Octokit } from '@octokit/rest';
import type { Analysis } from './claude';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function createIssue(
	serviceId: string,
	serviceName: string,
	url: string,
	analysis: Analysis,
) {
	const [owner, repo] = process.env.GITHUB_REPOSITORY!.split('/');
	const impactJa = analysis.affects_my_project ? '影響あり' : '影響なし';

	await octokit.issues.create({
		owner,
		repo,
		title: `[調査結果：${impactJa}] ${serviceName}の障害（${analysis.title}）`,
		body: [
			`## 🔍 調査結果`,
			`**${impactJa}** (severity: ${analysis.severity})`,
			``,
			`## 📋 障害概要`,
			analysis.summary,
			``,
			`## 🎯 影響を受ける機能`,
			analysis.affected_features.length > 0
				? analysis.affected_features.map((f) => `- ${f}`).join('\n')
				: '_なし_',
			``,
			`## ⚡ 推奨アクション`,
			analysis.action_needed,
			``,
			`## 🔗 ソース`,
			`- 検知URL: ${url}`,
			`- 検知時刻: ${new Date().toISOString()}`,
		].join('\n'),
		labels: [
			'incident',
			analysis.affects_my_project ? 'impact:yes' : 'impact:no',
			`service:${serviceId}`,
			`severity:${analysis.severity}`,
		],
	});
}
```

### `src/state.ts`（hashes.json 読み書き）

```ts
import { readFile, writeFile } from 'node:fs/promises';

const STATE_PATH = 'state/hashes.json';

export type State = Record<string, { hash: string; etag: string | null; updatedAt: string }>;

export async function loadState(): Promise<State> {
	try {
		return JSON.parse(await readFile(STATE_PATH, 'utf-8'));
	} catch {
		return {};
	}
}

export async function saveState(state: State): Promise<void> {
	await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}
```

### `src/index.ts`（オーケストレーション）

```ts
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { extract } from './extract';
import { analyze } from './claude';
import { createIssue } from './github';
import { loadState, saveState } from './state';

async function main() {
	const config = parse(await readFile('config/sources.yml', 'utf-8'));
	const projectDescription = await readFile('config/project.md', 'utf-8');
	const state = await loadState();

	for (const source of config.sources) {
		const prev = state[source.id];
		try {
			const result = await extract(source.url, prev?.etag ?? undefined);

			// 304 or 同一ハッシュ → スキップ
			if (!result) continue;
			if (result.hash === prev?.hash) continue;

			// 差分あり → Claude へ
			const analysis = await analyze(source.name, source.url, result.content, projectDescription);

			// インシデント情報を含むときだけ Issue 作成
			if (analysis.is_incident) {
				await createIssue(source.id, source.name, source.url, analysis);
			}

			state[source.id] = {
				hash: result.hash,
				etag: result.etag,
				updatedAt: new Date().toISOString(),
			};
		} catch (e) {
			console.error(`Error processing ${source.id}:`, e);
			// 1件失敗しても続行
		}
	}

	await saveState(state);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
```

---

## 必要な Secrets

リポジトリの Settings → Secrets and variables → Actions に登録：

| Secret              | 用途                                                |
| ------------------- | --------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Claude API 呼び出し（haiku-4-5 想定、月数ドル規模） |
| `GITHUB_TOKEN`      | 自動付与（Issue 作成 + state.json コミット）        |

---

## Slack 連携（コード不要）

Slack 側で1回コマンド実行するだけ：

```
/github subscribe {owner}/{repo} issues
```

label でフィルタしたければ：

```
/github subscribe {owner}/{repo} issues +label:"impact:yes"
```

→ 以降、Issue 作成のたびに自動で Slack #incidents に投稿される。

---

## 実装ステップ（推奨順序）

1. リポジトリ作成 + npm/TypeScript 初期化
2. `config/sources.yml` と `config/project.md` を埋める
3. `src/extract.ts` を実装し、ローカルで動作確認
4. `src/claude.ts` を実装（最初はモックでも可）
5. `src/state.ts` + `src/index.ts` を実装し、ローカルで E2E 確認
6. `src/github.ts` を追加し、test リポジトリで Issue 作成検証
7. `.github/workflows/watch.yml` を追加
8. `workflow_dispatch` で手動実行 → 全フロー確認
9. Slack で `/github subscribe` 実行
10. cron 有効化、24時間運用してログ確認

---

## 検証手順

### ローカル検証

```bash
# extract のみテスト
npx tsx src/extract.ts https://status.openai.com

# 全パイプライン（ドライラン：Issue 作らない）
DRY_RUN=1 npm run check

# 本番モード（実際にIssue作成）
npm run check
```

### GitHub Actions 検証

1. `workflow_dispatch` で手動キック（Actions タブから）
2. ログで以下を確認：
   - 各 URL の fetch 成功
   - ハッシュ計算成功
   - 差分判定ロジック
   - Claude レスポンス（初回は全 URL 分のレスポンスが見える）
3. Issue タブで初回作成された Issue を確認
4. Slack #incidents チャンネルで通知到達を確認
5. 2回目以降は「ハッシュ一致でスキップ」のログが出ることを確認

### 障害シミュレーション

- `state/hashes.json` を手動で改ざんして push → 次回 cron で「差分あり」と検知されるはず
- 既知の終了済みインシデント URL を一時的に sources.yml に追加して動作確認

---

## 既知の制約・残課題

### GitHub Actions cron の遅延

- 公式：最短 `*/5`、ただし混雑時は **5〜20分の遅延** が発生しうる
- 「5分以内に必ず通知」が必須要件になった場合は **Cloudflare Workers Cron Triggers** への移行を検討（無料枠で運用可能、コード資産は90%流用可）

### LINE の監視 URL

- 「LINE 全体」「LINE Developers API」「LINE Messaging API」でステータスページが異なる
- どの URL を `sources.yml` に書くべきか、実装着手時に確認必要

### Claude の判定揺れ

- 同じページ内容でも「影響あり/なし」の判定が日によってブレる可能性
- 必要なら `temperature: 0` 指定 + プロンプトに具体的な判定基準を明記する追加チューニング

### Issue の蓄積

- 影響なし Issue も作るので、長期運用で件数が増える
- 必要なら別 workflow で「30日以上前の `impact:no` Issue を自動クローズ」を追加可能

---

## 次のアクション

実装に進む際は以下を確定させる：

1. **新規リポジトリの場所と名前**（例: `~/projects/api-watcher`）
2. **`config/project.md` の内容**（守りたいプロジェクトの説明）
   - プロジェクト名
   - サービス概要
   - OpenAI / Slack / LINE の具体的な使い方
3. **LINE の監視 URL**（どのステータスページを見るか）
4. **Slack の通知チャンネル名**（`#incidents` でいいか確認）
