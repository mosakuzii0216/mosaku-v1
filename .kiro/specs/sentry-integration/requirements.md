# Requirements Document

## Project Description (Input)

Sentry を本番運用レベルに仕上げる。Backend/Frontend 既に SDK 組み込み済み（@sentry/nestjs + @sentry/react ^10.47.0）。DSN の環境変数投入（Cloud Run SENTRY_DSN / Vercel VITE_SENTRY_DSN）、サンプリング率の見直し（traces 0.1 / profiles 0.1、errors は 1.0）、PII スクラビング（メモ本文・招待コードを beforeSend でマスク）、ユーザー識別（ログイン後に Sentry.setUser）、リリーストラッキング（CI で SENTRY_RELEASE に git sha 注入）、source map アップロード（@sentry/vite-plugin 検討）、ノイズ除外ルール（AbortError / 404 / ネットワーク切断）、Slack 通知連携を決める。Phase 2 で実装する AI 障害自動調査パイプラインの土台となる設定を含める。

> **運用方針の改訂（2026-04-24）**
> コミット `3a0c286`（2026-04-23）で Staging 環境を廃止し、Production 単一運用＋Vercel Preview を検証環境として利用する構成に変更した。本スペックはこの方針に合わせ、Staging 専用プロジェクト分離・Staging 専用サンプリング・Staging 専用 Slack チャネル等の要件を削除し、Production 単一運用を前提とする。

## Introduction

Mosaku は招待制のマルチユーザーメモアプリであり、Backend（NestJS / Cloud Run）と Frontend（React / Vercel）に `@sentry/nestjs` および `@sentry/react` の SDK が既に組み込まれている。しかし現状は DSN 未設定・サンプリング率 100%・PII 対策なし・リリーストラッキングなしのため、本番運用に耐えない。本スペックでは、Sentry を「個人開発者が週 5 時間で運用できる最小の監視基盤」に仕上げ、Phase 2 で実装予定の AI 障害自動調査パイプライン（Sentry → Claude API → Slack）の前提となる設定を確立する。

運用環境は Production 単一とし、開発者のローカル環境（`development`）では Sentry を既定で無効化する。Vercel Preview デプロイは Production 用 Sentry プロジェクトに相乗りし、`release`（git sha）タグでメインラインのエラーと識別する。

対象範囲:

- Backend / Frontend / CI / Sentry プロジェクト設定 / Slack 通知の 5 レイヤー
- Production と development の 2 環境（Staging は廃止済み）
- 招待制（ADMIN / USER）ユーザー向けのプライバシー配慮

対象外（別スペックで扱う）:

- UptimeRobot によるアップタイム監視（`uptime-monitoring` で扱う）
- AI 障害自動調査パイプライン本体（Phase 2 / 別スペック）
- Staging 専用 Sentry プロジェクトや Staging 専用サンプリング（Staging 環境自体が廃止済みのため）
- Vercel Preview 由来のエラーを Production エラーから分離するフィルタリングの高度化（Phase 2 で AI triage 側が `release` タグを参照して判別する方針）

## Requirements

### Requirement 1: 環境識別と DSN 管理

**Objective:** 運用者として、Production と開発者ローカルを明確に区別し、ローカルのノイズで本番アラートを汚染したくない。招待制コミュニティの信頼性を守るため。

#### Acceptance Criteria

1. The Sentry Integration shall use a single Sentry project for Production with `environment: production` tag, and shall not create a separate Staging or Preview project.
2. When Backend starts on Cloud Run, the Backend Sentry SDK shall read `SENTRY_DSN` and `SENTRY_ENVIRONMENT` from environment variables and initialize Sentry with the `environment` tag set to `production`.
3. When Frontend is built for Vercel Production, the Frontend Sentry SDK shall read `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT` at build time and initialize Sentry with the `environment` tag set to `production`.
4. When Frontend is built for Vercel Preview, the Frontend Sentry SDK shall initialize with `environment: production` and the `release` tag set to the git sha so that Preview errors can be identified via `release` without environment separation.
5. If `SENTRY_DSN` (Backend) or `VITE_SENTRY_DSN` (Frontend) is not set, the Sentry SDK shall skip initialization without crashing the application.
6. While running in a local development environment (`NODE_ENV=development` or Vite dev server), the Sentry Integration shall default to disabled unless the developer explicitly opts in via a local `.env` override (in which case `SENTRY_ENVIRONMENT=development` is used).
7. The Sentry Integration shall document in `docs/deployment/` how to rotate DSNs and how to register them in Cloud Run (Secret Manager) and Vercel (Environment Variables).

### Requirement 2: サンプリング率の最適化

**Objective:** 運用者として、Sentry の無料枠（月次イベント上限）を超えない範囲で、本番の異常を確実に検知したい。コスト暴発を防ぎつつ重要なエラーを取りこぼさないため。

#### Acceptance Criteria

1. The Backend Sentry SDK shall send 100% of captured errors (`sampleRate: 1.0`) in Production.
2. The Backend Sentry SDK shall send 10% of performance traces (`tracesSampleRate: 0.1`) and 10% of profiles (`profilesSampleRate: 0.1`) in Production by default.
3. The Frontend Sentry SDK shall send 100% of captured errors and 10% of browser traces (`tracesSampleRate: 0.1`) in Production by default.
4. The Sentry Integration shall expose all sampling rates as environment variables (`SENTRY_ERROR_SAMPLE_RATE`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`, `VITE_SENTRY_TRACES_SAMPLE_RATE`) with safe defaults, so rates can be adjusted without code changes.
5. If the monthly Sentry event quota is approaching the limit, the Sentry Integration shall allow the operator to lower sampling rates via environment variable change and redeploy, without code modification.
6. While running in a local development environment, the Sentry Integration shall default sampling rates to `0` (effectively disabled) even when a DSN is provided for opt-in debugging.

### Requirement 3: PII スクラビング（プライバシー保護）

**Objective:** Mosaku ユーザーとして、自分が書いたメモの本文や招待コードが外部サービスに送信されないことを保証してほしい。招待制の小規模コミュニティの信頼を守るため。

#### Acceptance Criteria

1. When the Backend Sentry SDK captures an event, the Backend Sentry SDK shall execute a `beforeSend` hook that redacts the following fields from the event payload: memo content (`content`, `body`, `html`), invitation codes (`invitationCode`, `code` in auth/invitation contexts), passwords, password hashes, JWT tokens, and OAuth client secrets.
2. When the Frontend Sentry SDK captures an event, the Frontend Sentry SDK shall execute a `beforeSend` hook that redacts memo content from React Query cache snapshots, form state, and error messages before transmission.
3. The Sentry Integration shall replace redacted values with the literal string `[REDACTED]` so that the presence of the field remains visible for debugging.
4. The Sentry Integration shall disable Sentry's default PII collection by setting `sendDefaultPii: false` on both Backend and Frontend SDKs.
5. If a new API endpoint or React component handles user-generated text or secrets, the Sentry Integration shall provide a documented checklist (in `docs/deployment/sentry.md`) to verify scrubbing coverage before release.
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

**Objective:** 運用者として、どのリリース（コミット）でエラーが発生したかを特定したい。regression を起こしたコミットを素早く切り戻し、Vercel Preview と Production を `release` タグで区別するため。

#### Acceptance Criteria

1. When the Backend CI builds a Cloud Run image, the CI Pipeline shall inject `SENTRY_RELEASE=<git-sha>` as an environment variable into the container.
2. When the Frontend CI builds for Vercel (Production or Preview), the CI Pipeline shall inject `VITE_SENTRY_RELEASE=<git-sha>` at build time so that it is embedded into the compiled bundle.
3. The Backend Sentry SDK shall set `release: process.env.SENTRY_RELEASE` on initialization.
4. The Frontend Sentry SDK shall set `release: import.meta.env.VITE_SENTRY_RELEASE` on initialization.
5. When a new Production release is deployed, the CI Pipeline shall notify Sentry via the Sentry CLI (`sentry-cli releases new` and `finalize`) so that the release appears in Sentry's Release view.
6. If the `SENTRY_RELEASE` environment variable is absent, the Sentry SDK shall fall back to `unknown` or omit the release field rather than crash.

### Requirement 6: Source Map アップロード

**Objective:** 運用者として、本番で発生したフロントエンドエラーのスタックトレースを、ミニファイされていない元のソースコードとして読みたい。`a.b.c` のような暗号化されたスタックでは原因調査ができないため。

#### Acceptance Criteria

1. When Frontend is built for Production, the Frontend Build Pipeline shall generate source maps and upload them to Sentry, linked to the current `release` tag.
2. The Sentry Integration shall choose between `@sentry/vite-plugin` (build-time plugin) and Sentry CLI (post-build upload), with the chosen approach justified in the design document.
3. When source maps are uploaded, the Sentry Integration shall NOT deploy the source map files to the public Vercel domain (public accessibility of source maps is forbidden).
4. If source map upload fails during CI, the CI Pipeline shall log a warning but shall NOT block the deployment (source map is observability-only, not correctness).
5. When a Production release is deployed for the first time after this spec ships, the operator shall execute a documented smoke test procedure that deliberately throws an error in the Frontend and verifies that the error appears in Sentry with readable (de-minified) stack frames, within 10 minutes of deployment.

### Requirement 7: ノイズ除外ルール

**Objective:** 運用者として、日常的に発生する「無害なエラー」で通知疲れしたくない。本当にヤバいエラーだけに集中して対応するため。

#### Acceptance Criteria

1. The Frontend Sentry SDK shall ignore the following error classes/messages via `ignoreErrors`: `AbortError`, `NetworkError`, `Failed to fetch`, `Load failed`, browser extension errors (errors from `chrome-extension://`, `moz-extension://`).
2. The Backend Sentry SDK shall ignore 4xx HTTP responses (except 429 Too Many Requests and 401 on protected routes with suspicious patterns) in the default transaction/error filter.
3. When a request is canceled by the client (navigation away, request abort), the Sentry Integration shall not report it as an error.
4. The Sentry Integration shall document the ignore rules in `docs/deployment/sentry.md` so that future additions/removals are intentional and reviewable.
5. If a new ignore rule is added, the Sentry Integration shall include a short comment near the rule explaining why it is noise (not silent suppression).

### Requirement 8: Slack 通知連携

**Objective:** 運用者として、重大エラーが発生したときにスマホで気付ける状態にしたい。週 5 時間の開発ペースで障害対応の初動を最短化するため。

#### Acceptance Criteria

1. The Sentry Integration shall configure a Sentry Alert Rule that posts Production-environment issues to a single dedicated Slack channel `#mosaku-alerts` via Sentry's native Slack integration.
2. When a new issue is created in Production, the Sentry Alert shall fire (first-seen alert), posting the issue title, environment, release, affected user count, and a direct link to Sentry.
3. When an existing Production issue regresses (reopened after being resolved), the Sentry Alert shall fire with a "regression" label.
4. If the Slack integration fails or rate-limits, the Sentry Integration shall not retry aggressively or degrade Sentry's own availability (fire-and-forget semantics).
5. The Sentry Integration shall document the alert rule configuration in `docs/deployment/sentry.md` so it can be reproduced in a new Sentry workspace.
6. The Sentry Integration shall NOT configure per-`release` channel routing (all Production issues go to `#mosaku-alerts` regardless of whether they originated from Vercel Preview or Production mainline); differentiation between Preview and Production errors is handled downstream via the `release` tag and is out of scope for Phase 1 Slack routing.

### Requirement 9: AI 障害自動調査パイプラインの土台

**Objective:** 将来の自分として、Phase 2（9月）で実装する AI 障害自動調査パイプラインを無理なく接続できる状態にしておきたい。今の設定で構造化されたメタデータを残しておくことで、後から Claude に渡す文脈が揃うため。

#### Acceptance Criteria

1. The Sentry Integration shall attach the following structured tags to every captured event: `environment`, `release`, `feature_area` (e.g. `memo`, `notebook`, `auth`, `theme`, `invitation`), and `user_facing` (boolean, true if the error was visible to the end user).
2. The Backend Sentry SDK shall capture the NestJS controller name and handler name as Sentry tags for every HTTP exception, enabling AI-based triage by `feature_area`.
3. The Frontend Sentry SDK shall capture the React Router route pathname at the time of error as a Sentry tag (`route`), enabling AI-based grouping by user journey.
4. The Sentry Integration shall expose Sentry's Webhook / Issue-created event configuration in `docs/deployment/sentry.md` so that Phase 2's AI pipeline can subscribe without revisiting the SDK configuration.
5. The Sentry Integration shall NOT embed any AI pipeline logic (Claude API calls, prompt templates) in this phase — Phase 2 will add a separate consumer of the Sentry webhook.

### Requirement 10: ドキュメントと運用手順

**Objective:** 将来の自分として、半年後にこの設定を見返したときにも Sentry を運用できる状態にしたい。記憶に頼らず、ドキュメントから再構築できる運用性を担保するため。

#### Acceptance Criteria

1. The Sentry Integration shall produce or update `docs/deployment/sentry.md` covering: Sentry プロジェクトのセットアップ手順 / DSN の環境変数登録手順（Cloud Run + Vercel）/ アラートルールの設定 / サンプリング率の調整方法 / ローテーション手順 / Production first deploy 後の smoke test 手順。
2. The Sentry Integration shall update `.kiro/steering/tech.md` to reflect the final initialization pattern (環境変数名・サンプリング戦略・PII ポリシー・Production 単一運用)。
3. While a developer runs the app locally without `SENTRY_DSN`, the Sentry Integration shall emit a single informational log line explaining that Sentry is disabled (so the behavior is not silent).
4. The Sentry Integration shall update `CLAUDE.md` の「環境変数」セクションに `SENTRY_DSN` / `VITE_SENTRY_DSN` / `SENTRY_RELEASE` / `SENTRY_ENVIRONMENT` / サンプリング率系の環境変数を追記する。
5. The Sentry Integration shall remove or update outdated Sentry sections in `docs/deployment/cloud-run.md` and `docs/deployment/vercel.md` so that `docs/deployment/sentry.md` becomes the single source of truth.
