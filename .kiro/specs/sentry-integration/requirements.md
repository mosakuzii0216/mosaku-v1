# Requirements Document

## Project Description (Input)

Sentry を本番運用レベルに仕上げる。Backend/Frontend 既に SDK 組み込み済み（@sentry/nestjs + @sentry/react ^10.47.0）。Staging/Production のプロジェクト分離、DSN の環境変数投入（Cloud Run SENTRY_DSN / Vercel VITE_SENTRY_DSN）、サンプリング率の見直し（traces 0.1 / profiles 0.1、errors は 1.0）、PII スクラビング（メモ本文・招待コードを beforeSend でマスク）、ユーザー識別（ログイン後に Sentry.setUser）、リリーストラッキング（CI で SENTRY_RELEASE に git sha 注入）、source map アップロード（@sentry/vite-plugin 検討）、ノイズ除外ルール（AbortError / 404 / ネットワーク切断）、Slack 通知連携を決める。Phase 2 で実装する AI 障害自動調査パイプラインの土台となる設定を含める。

## Introduction

Mosaku は招待制のマルチユーザーメモアプリであり、Backend（NestJS / Cloud Run）と Frontend（React / Vercel）に `@sentry/nestjs` および `@sentry/react` の SDK が既に組み込まれている。しかし現状は DSN 未設定・サンプリング率 100%・PII 対策なし・環境分離なしのため、本番運用に耐えない。本スペックでは、Sentry を「個人開発者が週 5 時間で運用できる最小の監視基盤」に仕上げ、Phase 2 で実装予定の AI 障害自動調査パイプライン（Sentry → Claude API → Slack）の前提となる設定を確立する。

対象範囲:

- Backend / Frontend / CI / Sentry プロジェクト設定 / Slack 通知の 5 レイヤー
- Staging と Production の 2 環境
- 招待制（ADMIN / USER）ユーザー向けのプライバシー配慮

対象外（別スペックで扱う）:

- UptimeRobot によるアップタイム監視（`uptime-monitoring` で扱う）
- AI 障害自動調査パイプライン本体（Phase 2 / 別スペック）

## Requirements

### Requirement 1: 環境分離と DSN 管理

**Objective:** 運用者として、Staging と Production のエラーを明確に区別して受け取りたい。Staging のノイズで本番アラートが埋もれないようにするため。

#### Acceptance Criteria

1. The Sentry Integration shall provide separate Sentry projects (or a single project with distinct `environment` tags) for Staging and Production, with a documented decision recorded in the design document.
2. When Backend starts on Cloud Run, the Backend Sentry SDK shall read `SENTRY_DSN` and `SENTRY_ENVIRONMENT` from environment variables and initialize Sentry with the `environment` tag set accordingly.
3. When Frontend is built for Vercel, the Frontend Sentry SDK shall read `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT` at build time and initialize Sentry with the `environment` tag set accordingly.
4. If `SENTRY_DSN` (Backend) or `VITE_SENTRY_DSN` (Frontend) is not set, the Sentry SDK shall skip initialization without crashing the application.
5. While running in a local development environment (`NODE_ENV=development` or Vite dev server), the Sentry Integration shall default to disabled unless the developer explicitly opts in via a local `.env` override.
6. The Sentry Integration shall document in `docs/deployment/` how to rotate DSNs and how to register them in Cloud Run (Secret Manager) and Vercel (Environment Variables).

### Requirement 2: サンプリング率の最適化

**Objective:** 運用者として、Sentry の無料枠（月次イベント上限）を超えない範囲で、本番の異常を確実に検知したい。コスト暴発を防ぎつつ重要なエラーを取りこぼさないため。

#### Acceptance Criteria

1. The Backend Sentry SDK shall send 100% of captured errors (`sampleRate: 1.0`) in both Staging and Production.
2. The Backend Sentry SDK shall send 10% of performance traces (`tracesSampleRate: 0.1`) and 10% of profiles (`profilesSampleRate: 0.1`) in Production.
3. While running in Staging, the Backend Sentry SDK shall send 100% of traces and profiles (`tracesSampleRate: 1.0`, `profilesSampleRate: 1.0`) to allow verification of the instrumentation itself.
4. The Frontend Sentry SDK shall send 100% of captured errors and 10% of browser traces in Production, and 100% of traces in Staging, with the same pattern as Backend.
5. The Sentry Integration shall expose all sampling rates as environment variables (e.g. `SENTRY_TRACES_SAMPLE_RATE`) with safe defaults, so rates can be adjusted without code changes.
6. If the monthly Sentry event quota is approaching the limit, the Sentry Integration shall allow the operator to lower sampling rates via environment variable change and redeploy, without code modification.

### Requirement 3: PII スクラビング（プライバシー保護）

**Objective:** Mosaku ユーザーとして、自分が書いたメモの本文や招待コードが外部サービスに送信されないことを保証してほしい。招待制の小規模コミュニティの信頼を守るため。

#### Acceptance Criteria

1. When the Backend Sentry SDK captures an event, the Backend Sentry SDK shall execute a `beforeSend` hook that redacts the following fields from the event payload: memo content (`content`, `body`, `html`), invitation codes (`invitationCode`, `code` in auth/invitation contexts), passwords, password hashes, JWT tokens, and OAuth client secrets.
2. When the Frontend Sentry SDK captures an event, the Frontend Sentry SDK shall execute a `beforeSend` hook that redacts memo content from React Query cache snapshots, form state, and error messages before transmission.
3. The Sentry Integration shall replace redacted values with the literal string `[REDACTED]` so that the presence of the field remains visible for debugging.
4. The Sentry Integration shall disable Sentry's default PII collection by setting `sendDefaultPii: false` on both Backend and Frontend SDKs.
5. If a new API endpoint or React component handles user-generated text or secrets, the Sentry Integration shall provide a documented checklist (in the design document) to verify scrubbing coverage before release.
6. The Sentry Integration shall include at least one automated test per SDK that verifies the `beforeSend` hook redacts a sample payload containing memo content and an invitation code.

### Requirement 4: ユーザー識別とセッショントラッキング

**Objective:** 運用者として、エラーが発生したユーザーを特定して個別にフォローアップしたい。招待制の小規模コミュニティでは 1 人ずつ対応できるため。

#### Acceptance Criteria

1. When a user successfully authenticates (login or token refresh), the Frontend Sentry SDK shall call `Sentry.setUser({ id: userId })` with the authenticated user's ID only (no email, no display name).
2. When a user logs out, the Frontend Sentry SDK shall call `Sentry.setUser(null)` to clear the user context.
3. When the Backend processes a request with a valid JWT, the Backend Sentry SDK shall associate the current scope with `{ id: userId }` for the duration of the request.
4. If a request is unauthenticated (public endpoint or invalid token), the Backend Sentry SDK shall leave the user scope empty (no placeholder `anonymous` ID).
5. The Sentry Integration shall NOT set email, username, IP address, or OAuth provider details as Sentry user attributes.

### Requirement 5: リリーストラッキング

**Objective:** 運用者として、どのリリース（コミット）でエラーが発生したかを特定したい。regression を起こしたコミットを素早く切り戻すため。

#### Acceptance Criteria

1. When the Backend CI builds a Cloud Run image, the CI Pipeline shall inject `SENTRY_RELEASE=<git-sha>` as an environment variable into the container.
2. When the Frontend CI builds for Vercel, the CI Pipeline shall inject `VITE_SENTRY_RELEASE=<git-sha>` at build time so that it is embedded into the compiled bundle.
3. The Backend Sentry SDK shall set `release: process.env.SENTRY_RELEASE` on initialization.
4. The Frontend Sentry SDK shall set `release: import.meta.env.VITE_SENTRY_RELEASE` on initialization.
5. When a new release is deployed, the CI Pipeline shall notify Sentry via the Sentry CLI (`sentry-cli releases new` and `finalize`) so that the release appears in Sentry's Release view.
6. If the `SENTRY_RELEASE` environment variable is absent, the Sentry SDK shall fall back to `unknown` or omit the release field rather than crash.

### Requirement 6: Source Map アップロード

**Objective:** 運用者として、本番で発生したフロントエンドエラーのスタックトレースを、ミニファイされていない元のソースコードとして読みたい。`a.b.c` のような暗号化されたスタックでは原因調査ができないため。

#### Acceptance Criteria

1. When Frontend is built for Production, the Frontend Build Pipeline shall generate source maps and upload them to Sentry, linked to the current `release` tag.
2. The Sentry Integration shall choose between `@sentry/vite-plugin` (build-time plugin) and Sentry CLI (post-build upload), with the chosen approach justified in the design document.
3. When source maps are uploaded, the Sentry Integration shall NOT deploy the source map files to the public Vercel domain (public accessibility of source maps is forbidden).
4. If source map upload fails during CI, the CI Pipeline shall log a warning but shall NOT block the deployment (source map is observability-only, not correctness).
5. The Sentry Integration shall include at least one Staging smoke test that verifies a deliberately thrown error in the Frontend appears in Sentry with readable (de-minified) stack frames.

### Requirement 7: ノイズ除外ルール

**Objective:** 運用者として、日常的に発生する「無害なエラー」で通知疲れしたくない。本当にヤバいエラーだけに集中して対応するため。

#### Acceptance Criteria

1. The Frontend Sentry SDK shall ignore the following error classes/messages via `ignoreErrors`: `AbortError`, `NetworkError`, `Failed to fetch`, `Load failed`, browser extension errors (errors from `chrome-extension://`, `moz-extension://`).
2. The Backend Sentry SDK shall ignore 4xx HTTP responses (except 429 Too Many Requests and 401 on protected routes with suspicious patterns) in the default transaction/error filter.
3. When a request is canceled by the client (navigation away, request abort), the Sentry Integration shall not report it as an error.
4. The Sentry Integration shall document the ignore rules in the design document so that future additions/removals are intentional and reviewable.
5. If a new ignore rule is added, the Sentry Integration shall include a short comment near the rule explaining why it is noise (not silent suppression).

### Requirement 8: Slack 通知連携

**Objective:** 運用者として、重大エラーが発生したときにスマホで気付ける状態にしたい。週 5 時間の開発ペースで障害対応の初動を最短化するため。

#### Acceptance Criteria

1. The Sentry Integration shall configure a Sentry Alert Rule that posts to a dedicated Slack channel (e.g. `#mosaku-alerts`) via Slack Webhook or Sentry's Slack integration.
2. When a new issue is created in Production, the Sentry Alert shall fire (first-seen alert), posting the issue title, environment, release, affected user count, and a direct link to Sentry.
3. When an existing issue regresses (reopened after being resolved), the Sentry Alert shall fire with a "regression" label.
4. While running in Staging, the Sentry Integration shall route alerts to a separate low-priority channel (e.g. `#mosaku-staging`) or suppress them, to avoid Staging noise in the production alert channel.
5. If the Slack Webhook fails or rate-limits, the Sentry Integration shall not retry aggressively or degrade Sentry's own availability (fire-and-forget semantics).
6. The Sentry Integration shall document the alert rule configuration in `docs/deployment/` so it can be reproduced in a new Sentry workspace.

### Requirement 9: AI 障害自動調査パイプラインの土台

**Objective:** 将来の自分として、Phase 2（9月）で実装する AI 障害自動調査パイプラインを無理なく接続できる状態にしておきたい。今の設定で構造化されたメタデータを残しておくことで、後から Claude に渡す文脈が揃うため。

#### Acceptance Criteria

1. The Sentry Integration shall attach the following structured tags to every captured event: `environment`, `release`, `feature_area` (e.g. `memo`, `notebook`, `auth`, `theme`, `invitation`), and `user_facing` (boolean, true if the error was visible to the end user).
2. The Backend Sentry SDK shall capture the NestJS controller name and handler name as Sentry tags for every HTTP exception, enabling AI-based triage by `feature_area`.
3. The Frontend Sentry SDK shall capture the React Router route pathname at the time of error as a Sentry tag (`route`), enabling AI-based grouping by user journey.
4. The Sentry Integration shall expose Sentry's Webhook / Issue-created event configuration in the design document so that Phase 2's AI pipeline can subscribe without revisiting the SDK configuration.
5. The Sentry Integration shall NOT embed any AI pipeline logic (Claude API calls, prompt templates) in this phase — Phase 2 will add a separate consumer of the Sentry webhook.

### Requirement 10: ドキュメントと運用手順

**Objective:** 将来の自分として、半年後にこの設定を見返したときにも Sentry を運用できる状態にしたい。記憶に頼らず、ドキュメントから再構築できる運用性を担保するため。

#### Acceptance Criteria

1. The Sentry Integration shall produce or update `docs/deployment/sentry.md` covering: Sentry プロジェクトのセットアップ手順 / DSN の環境変数登録手順（Cloud Run + Vercel）/ アラートルールの設定 / サンプリング率の調整方法 / ローテーション手順。
2. The Sentry Integration shall update `.kiro/steering/tech.md` to reflect the final initialization pattern (環境変数名・サンプリング戦略・PII ポリシー)。
3. When a developer runs the app locally without `SENTRY_DSN`, the Sentry Integration shall emit a single informational log line explaining that Sentry is disabled (so the behavior is not silent).
4. The Sentry Integration shall update `CLAUDE.md` の「環境変数」セクションに `SENTRY_DSN` / `VITE_SENTRY_DSN` / `SENTRY_RELEASE` / `SENTRY_ENVIRONMENT` を追記する。
