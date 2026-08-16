# Gap Analysis & Research — sentry-integration

> **Scope Note（2026-04-24 改訂）**
> コミット `3a0c286`（2026-04-23）で Staging 環境を廃止したため、本ギャップ分析は **Production 単一運用 + Vercel Preview を release タグで識別** を前提とする。Staging 専用 Sentry プロジェクト・Staging 専用サンプリング・Staging 専用 Slack チャネルに関する議論は削除済み。

---

## Summary

- **Feature**: `sentry-integration`
- **Discovery Scope**: Extension（SDK 組み込み済み、設定・運用レイヤーを追加）
- **Deployment Topology**: Production 単一。Vercel Preview は Production Sentry プロジェクトに相乗りし `release=<git-sha>` で識別
- **Key Findings**:
  - Backend / Frontend とも Sentry SDK は初期化済みだが、本番運用に必要な属性（`environment` / `release` / `beforeSend` / `setUser` / `ignoreErrors` / `sendDefaultPii`）が未設定。Backend の `tracesSampleRate` / `profilesSampleRate` はともに `1.0`（100%）で Sentry 無料枠の暴発リスクが大
  - CI は Cloud Run（Workload Identity）/ Vercel とも稼働中で、`${{ github.sha }}` を Docker タグに使っているため `SENTRY_RELEASE` 注入は低コストだが、**現在 CI に Sentry 関連のステップは 1 行も無い**（grep で 0 件確認）
  - `docs/deployment/cloud-run.md` §C6.2 / `docs/deployment/vercel.md` §V5.3 に「オプション」扱いの旧 Sentry セクションが残存し、`@sentry/node` 前提など現状コードと乖離。**本スペックで最新化する必要あり**（`docs/deployment/sentry.md` を single source に）
  - 認証の `setUser` 挿入ポイント候補だった `frontend/src/hooks/useAuth.ts` は **どこからも import されていない dead code**（grep で import 0 件を確認）。`AuthContext.tsx` を唯一の挿入点とできる
  - Slack Webhook は既に CI 通知で稼働中（`SLACK_WEBHOOK_URL`）。Sentry → Slack 通知は Sentry ネイティブ統合を採用し、Webhook は CI 通知専用として温存する 2 レイヤー運用が最適
  - Staging 廃止に伴い、**Sentry プロジェクトは 1 個**で確定。`environment` タグは実質 `production` 固定（ローカル opt-in 時のみ `development`）

---

## Current State Investigation

### 既存 Sentry 関連資産のスナップショット

| レイヤー               | ファイル                                                                 | 現状                                                                                                          | 充足度                                   |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Backend 初期化         | `backend/src/instrument.ts`                                              | `dsn` + `nodeProfilingIntegration` + `tracesSampleRate: 1.0` + `profilesSampleRate: 1.0` のみ                 | 最小限                                   |
| Backend 起動順         | `backend/src/main.ts`                                                    | 先頭で `import './instrument'`（steering 記載の不変条件）                                                     | OK                                       |
| Backend グローバル統合 | `backend/src/app.module.ts`                                              | `SentryModule.forRoot()` + `SentryGlobalFilter` を `APP_FILTER` 登録                                          | OK                                       |
| Backend 認証           | `backend/src/auth/jwt-auth.guard.ts`                                     | `@Public()` opt-out のグローバル JWT Guard。`req.user` 注入あり、`Sentry.setUser` なし                        | 未実装                                   |
| Backend 環境変数ハブ   | `backend/src/config/config.service.ts`                                   | JWT / CORS / OAuth / Session 等は網羅。**Sentry 系プロパティ 0**                                              | 未実装                                   |
| Frontend 初期化        | `frontend/src/main.tsx`                                                  | `dsn` + `browserTracingIntegration` + `tracesSampleRate: import.meta.env.PROD ? 0.2 : 0` + `enabled` ガード   | 部分的                                   |
| Frontend 認証          | `frontend/src/contexts/AuthContext.tsx`                                  | `handleAuthSuccess` / `logout` / `refreshUser` が single source。`Sentry.setUser` 未呼び出し                  | 未実装                                   |
| Frontend 重複          | `frontend/src/hooks/useAuth.ts`                                          | **import 0 件の dead code**（grep で確定）                                                                    | 対応不要                                 |
| Frontend 環境変数ハブ  | `frontend/src/utils/env.ts`                                              | backend/app URL・Supabase・OAuth ID は validate。**Sentry 系プロパティ 0**                                    | 未実装                                   |
| Frontend ビルド        | `frontend/vite.config.ts`                                                | `react()` + `VitePWA(...)`。**`@sentry/vite-plugin` 未インストール / `build.sourcemap` 未設定**               | 未実装                                   |
| CI Backend             | `.github/workflows/deploy-backend.yml`                                   | WIF + gcloud build + Cloud Run deploy + Slack 通知。**Sentry 関連ステップ 0**（grep 確認）                    | 未実装                                   |
| CI Frontend            | `.github/workflows/deploy-frontend-prod.yml`                             | `vercel pull/build/deploy --prod` + Slack 通知。**Sentry 関連ステップ 0**（grep 確認）                        | 未実装                                   |
| Docs                   | `docs/deployment/cloud-run.md` §C6.2 / `docs/deployment/vercel.md` §V5.3 | `@sentry/node` 時代の旧ガイドが「オプション」扱いで残存。現行 SDK（`@sentry/nestjs` / `@sentry/react`）と乖離 | 要差し替え                               |
| Steering               | `.kiro/steering/tech.md`                                                 | `@sentry/nestjs` / `@sentry/react` を Key Libraries に記載、初期化位置の不変条件あり                          | 要加筆（PII ポリシー・サンプリング戦略） |
| CLAUDE.md              | プロジェクト規約                                                         | `SENTRY_DSN` / `VITE_SENTRY_DSN` / `SENTRY_RELEASE` 等の記載なし                                              | 要加筆                                   |

### 開発標準・制約

- **「Sentry 初期化は最初の import」は steering 記載の不変条件**（`tech.md` の Key Technical Decisions）。`instrument.ts` はモジュール DI に参加できないため `process.env` 直読みする必要があることは確定事項
- **「グローバル JWT Guard + `@Public()` opt-out」が認証の既定パターン**。`SentryUserContextInterceptor` は `APP_INTERCEPTOR` でグローバル登録することで、公開ルート（`req.user` 無し）でも副作用ゼロにできる
- **1 ドメイン = 1 モジュール / 責務別ディレクトリ**（structure.md）。Sentry 関連ユーティリティは `backend/src/common/` および `frontend/src/utils/` 配下に配置する規約に沿う
- **`any` 禁止 + strict mode**。scrubber は `unknown` / ジェネリクスで型付ける
- **PWA SW（`vite-plugin-pwa`）と `@sentry/vite-plugin` の共存**は公式では既知衝突なし（要設計段階で動作確認）

---

## Requirement-to-Asset Map

| Req                                      | 要件要旨                                                                                                                                                   | 既存資産                                                                                                                        | ギャップ                                                                                                                                                                                                                                                             | タグ                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **1. 環境識別・DSN**                     | 単一プロジェクト + `environment=production` タグ、DSN 未設定時は init スキップ、ローカル既定無効                                                           | `instrument.ts`（DSN 読込済）/ `main.tsx`（DSN + enabled ガード済）/ `ConfigService` / `envValidator`                           | `environment` / `release` / `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` 未設定。Sentry プロジェクト未作成。`ConfigService` / `envValidator` に Sentry 公開 API が無い。ローカル opt-in 時のログ出力（Req 10.3）未実装                                           | **Missing**（設定・公開 API・ログ）                                  |
| **2. サンプリング率**                    | Backend errors 1.0 / traces 0.1 / profiles 0.1、Frontend errors 1.0 / traces 0.1、環境変数化、ローカル既定 0                                               | Backend `tracesSampleRate: 1.0 / profilesSampleRate: 1.0` / Frontend `tracesSampleRate: PROD ? 0.2 : 0`                         | Backend 100% のため本番コスト暴発リスク大。Frontend は 0.2 で要件 0.1 と微差。**環境変数化されていない**（`SENTRY_ERROR_SAMPLE_RATE` / `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE` / `VITE_SENTRY_TRACES_SAMPLE_RATE`）。ローカル既定 0 ガードも無い | **Missing**（環境変数化 + デフォルト値調整）                         |
| **3. PII スクラビング**                  | メモ本文・招待コード・JWT・パスワード・OAuth secret を `[REDACTED]`、`sendDefaultPii: false`、両 SDK にテスト                                              | Backend / Frontend とも `beforeSend` 未設定、`sendDefaultPii` 既定値（true 相当）                                               | **全く実装されていない**。scrubber ヘルパも無ければテストも無い。TipTap の JSON document（`content`）や React Query cache snapshot まで対象を広げる必要あり                                                                                                          | **Missing**（実装 + テスト）                                         |
| **4. ユーザー識別**                      | Frontend setUser({id}) ログイン/ログアウト、Backend は認証済み request で id のみ、公開ルートは匿名                                                        | `AuthContext` が単一挿入点（`useAuth.ts` は dead code で確定）/ `JwtAuthGuard` で `req.user` 注入済                             | `Sentry.setUser` 呼び出しが 0 箇所。Backend 側の NestJS Interceptor（`SentryUserContextInterceptor`）が新規必要。email / OAuth provider を含めない契約のテストが必要                                                                                                 | **Missing**（AuthContext 追記 + Interceptor 新規）                   |
| **5. リリーストラッキング**              | CI で `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` 注入、SDK に release 設定、sentry-cli で `releases new/finalize`、未設定時は fallback                       | CI は `${{ github.sha }}` を Docker タグに使用可能 / Cloud Run `--set-env-vars` / Vercel `vercel build` 時の env 注入は標準手段 | `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` の CI 注入が無い。`sentry-cli releases new/finalize` 呼び出しも無い。SDK 側 `release` 設定も無い                                                                                                                            | **Missing**（CI 2 本 + SDK 2 箇所）                                  |
| **6. Source Map アップロード**           | ビルド時生成 + アップロード + `.map` 非公開、CI 失敗でもデプロイ継続、Production smoke test                                                                | `vite.config.ts` に `sourcemap` 設定なし、`@sentry/vite-plugin` 未インストール                                                  | Frontend ビルドで sourcemap 生成 0。`@sentry/vite-plugin` と `VitePWA` の並行動作は **設計段階で要確認**（公式互換性記載はあるが本リポジトリで未検証）                                                                                                               | **Missing**（実装）+ **Unknown**（PWA プラグイン共存の実検証）       |
| **7. ノイズ除外**                        | Frontend `AbortError` / `NetworkError` / browser-extension 除外、Backend 4xx（429・疑わしい 401 除く）除外、キャンセルリクエスト非報告、docs 化            | なし                                                                                                                            | `ignoreErrors` / `denyUrls` / 4xx 除外 全て未設定。除外理由コメント運用も未整備                                                                                                                                                                                      | **Missing**                                                          |
| **8. Slack 通知**                        | Sentry ネイティブ統合で Production issue を `#mosaku-alerts` に first-seen / regression 通知、fire-and-forget                                              | `SLACK_WEBHOOK_URL` は GitHub Secrets にあり CI デプロイ通知で稼働中。**Sentry 側からは未連携**                                 | Sentry 側のアラートルール・Slack ワークスペース OAuth 連携・`#mosaku-alerts` チャネル用意が未設定。CI 通知用 webhook と **役割を分離するドキュメント** が必要                                                                                                        | **Missing**（Sentry UI 設定 + docs）                                 |
| **9. 構造化タグ（AI パイプライン土台）** | `environment` / `release` / `feature_area` / `user_facing` / `route` タグ、NestJS controller/handler 名、React Router route 名を付与、Webhook 設定 docs 化 | NestJS 例外フィルタから controller 情報は取得可能 / React Router v7 導入済みで `useLocation` 使用可能                           | `feature_area` マップ、`user_facing` 判定、controller/handler 抽出、`useSentryRouteTag` フック、Sentry Webhook 受け口 docs いずれも未実装                                                                                                                            | **Missing**                                                          |
| **10. ドキュメント・運用**               | `docs/deployment/sentry.md` 新規、`.kiro/steering/tech.md` / `CLAUDE.md` 更新、旧 Sentry セクション削除・差し替え                                          | `docs/deployment/cloud-run.md` §C6.2 / `vercel.md` §V5.3 に旧ガイド（`@sentry/node` 前提）/ `tech.md` に SDK 記載あり           | `docs/deployment/sentry.md` が存在しない。旧 2 セクションは「オプション」扱いで最新化要。`CLAUDE.md` の環境変数節に Sentry 系未記載                                                                                                                                  | **Missing**（新規 doc）+ **Constraint**（旧 2 セクションの差し替え） |

### 複雑度シグナル

- **CRUD 的シンプル**: `ConfigService` / `envValidator` への Sentry プロパティ追加、`Sentry.setUser` 追記、CI の `--set-env-vars` 拡張
- **ロジックあり**: PII scrubber（再帰走査 + 循環参照ガード + TipTap JSON 走査）、`feature_area` マッピング、`user_facing` 判定
- **外部統合**: Sentry UI（プロジェクト作成・Alert Rule・Slack integration）、Sentry CLI（releases finalize）、`@sentry/vite-plugin`（sourcemap + release 登録）
- **ワークフロー**: CI 2 本（backend / frontend）に release 注入 + sentry-cli / plugin ステップ追加

---

## Research Log

### R1. Sentry SDK 初期化パターン（NestJS）

- **Context**: `backend/src/main.ts` 先頭で `import './instrument'` している理由と、`SentryModule.forRoot()` / `SentryGlobalFilter` との連動
- **Findings**:
  - `@sentry/nestjs` は「instrument ファイルで `Sentry.init` → AppModule で `SentryModule.forRoot()` → `APP_FILTER` に `SentryGlobalFilter`」の 3 点セットが公式推奨パターン。既にこの形は満たしている
  - `beforeSend` / `beforeSendTransaction` は `Sentry.init` オプションに追加するだけで良く、`SentryModule` の改修は不要
  - `Sentry.getCurrentScope().setUser()` は NestJS Interceptor 内で呼び出し可能。`@sentry/nestjs` が request handler 時点で AsyncLocalStorage を介したスコープ伝搬を確立するため、`APP_INTERCEPTOR` 経由のグローバル登録が最も軽量
- **Implications**: `instrument.ts` の `Sentry.init` 拡張 + 新規 `SentryUserContextInterceptor` の 2 点で User 識別と PII スクラビングを実現可能。`JwtAuthGuard` の責務は崩さない

### R2. Source Map アップロード方式（`@sentry/vite-plugin` vs Sentry CLI）

- **Context**: Frontend の sourcemap 生成・アップロード・非公開化・release 登録をどう実装するか
- **Findings**:
  - `@sentry/vite-plugin` は `vite.config.ts` にプラグインを追加するだけで、ビルド時に sourcemap 生成 + Sentry アップロード + release 登録 + 非公開化（`sourcemaps.filesToDeleteAfterUpload`）まで自動化
  - Sentry CLI は Vercel ビルドログ内でポストステップを割り込ませる必要があり、`vercel build` の内部に手を入れる or post-deploy で別コマンドを実行することになる。CI 記述量が増える
  - Vite 6 + `vite-plugin-pwa` との共存互換は公式 Issue で「既知の衝突なし」。ただし Service Worker の `.map` を含めないようにするには `workbox.globPatterns` に `.map` を含めないことを確認する必要あり（本リポジトリ現行は `{js,css,html,svg,png,ico,woff2}` に限定済みで問題なし）
- **Implications**: **Frontend は `@sentry/vite-plugin` 第一候補**。Backend はイメージビルド時ではなく Cloud Run デプロイ後のリリース finalize のみ Sentry CLI を使用する 2 方式併用が現実的

### R3. Frontend ユーザー識別の統合ポイント

- **Context**: `AuthContext.tsx` と `useAuth.ts` の両方に `useState<UserProfile>` が存在（過去の研究ログで Unknown として残っていた）
- **Findings（本ギャップ分析で確定）**:
  - `frontend/src/hooks/useAuth.ts` は **どこからも import されていない dead code**（`grep -rn "from .*hooks/useAuth"` で 0 件、`AuthContext.tsx` 末尾の `export { useEmailAuth }` も `hooks/useEmailAuth.ts` 由来で useAuth.ts とは無関係）
  - `AuthContext` が現在の唯一の user state single source。`useEmailAuth` / `useOAuth` を内包し、`handleAuthSuccess` / `logout` / `refreshUser` が setUser の挿入点
- **Implications**: **AuthContext 1 箇所のみで完結**。`useAuth.ts` の削除は本スペックのスコープ外とし、別の cleanup spec（もしくは daily-refactor）で扱う（design.md の Non-Goals にも記載済み）

### R4. Deployment Topology（Staging 廃止後の構成）

- **Context**: Staging 環境を 2026-04-23（commit `3a0c286`）で廃止後、Sentry プロジェクトを何個にするか / Vercel Preview をどう扱うか
- **Findings**:
  - 個人開発者 + Production 単一運用では **「1 プロジェクト + `environment` タグ」** が運用コスト最小（Sentry 無料枠もプロジェクト単位で消費）
  - Vercel Preview は Production の DSN / `SENTRY_ENVIRONMENT=production` を共有し、`release` タグ（git sha）でメインラインと識別する。`environment` 分離は行わない
  - Phase 2 の AI triage は Sentry Webhook の `release` を参照してメインライン / Preview を判別する設計にすれば、Phase 1 では Slack チャネル分割も不要
  - 将来 Staging を再構築する場合でも、`environment` タグを切り替えるだけで拡張できる（プロジェクト分割は後で導入可能）
- **Implications**: **単一 Sentry プロジェクト + `environment: production` 固定**を design で確定。Slack チャネルは `#mosaku-alerts` 1 本で十分

### R5. Slack 通知方式

- **Context**: Sentry ネイティブ Slack 統合 vs. 既存 `SLACK_WEBHOOK_URL` 流用
- **Findings**:
  - Sentry ネイティブ統合は OAuth で Slack ワークスペースに接続し、Sentry UI 上でアラートルール作成・メッセージ整形を完結。fire-and-forget semantics で Sentry 側のリトライに委ねられる
  - 既存 `SLACK_WEBHOOK_URL` は CI デプロイ通知で稼働中。Webhook 流用は JSON ペイロードを自前整形する必要があり、Phase 2 で Claude を挟む前提なら中継サーバが要る
  - Phase 2 の AI 自動調査パイプラインは Sentry Webhook（Issue created）をトリガに独立した Workers / Cloud Functions で動く想定。Slack 通知は Sentry ネイティブ、Claude 連携は Webhook で分離するのが綺麗
- **Implications**: **Phase 1 は Sentry ネイティブ Slack 統合 + CI webhook は現状維持**（役割分離）。Phase 2 で Webhook + Claude を追加する 2 段階構成

### R6. サンプリング率の妥当性

- **Context**: Backend 既定 `1.0 / 1.0` は過剰。Sentry 無料枠内に収めるための初期値
- **Findings**:
  - Sentry Free プラン（2026 年時点）: errors 5K/month、performance 10K/month、profiles 20K/month（目安・最新はアカウント設定で確認）
  - 招待制の小規模コミュニティ（想定 DAU 10〜50）では traces 10% でも枠内に十分収まる想定
  - `profilesSampleRate` は `tracesSampleRate` に依存して発火するため、`traces 0.1 × profiles 0.1 = 1%` の実効率になる点に留意
- **Implications**: 初期値は要件通り `errors 1.0 / traces 0.1 / profiles 0.1` でスタートし、月次で消費量を確認して調整（環境変数化により再デプロイなしで可能）

### R7. PII ブラックリスト vs ホワイトリスト

- **Context**: `beforeSend` でマスクする対象を網羅するための方式選択
- **Findings**:
  - **ブラックリスト方式**（マスクするキー名 + 値の正規表現を列挙）は実装が軽く既存 DTO に影響しないが、新規 DTO 追加時のマスク漏れリスクあり
  - **ホワイトリスト方式**（送信してよい項目を列挙し、それ以外を全部 `[REDACTED]`）は漏れが起きないが、Sentry のデバッグ情報（stack frames の変数など）まで過剰に消す副作用が大きい
  - 本リポジトリは zod schema 駆動の将来化余地はあるが、本スペックでは時間コストに見合わない
- **Implications**: **ブラックリスト方式 + 定期監査**を採用（設計書 Security Considerations と要件 3.5 の運用チェックリストで補完）。将来 zod annotation 化する余地は別スペックとして残す

---

## Implementation Approach Options

### Option A: 既存ファイル拡張中心（最小ファイル変更）

**対象**:

- `backend/src/instrument.ts` に `beforeSend` / `release` / `environment` / `ignoreErrors` / `sampleRate` / `sendDefaultPii: false` を追加
- `frontend/src/main.tsx` の `Sentry.init` を同様に拡張（`reactRouterV7BrowserTracingIntegration` 追加）
- `backend/src/config/config.service.ts` に `sentryDsn` / `sentryEnvironment` / `sentryRelease` / `sentryTracesSampleRate` / `sentryProfilesSampleRate` を追加
- `frontend/src/utils/env.ts` に `sentryDsn` / `sentryEnvironment` / `sentryRelease` / `sentryTracesSampleRate` を追加
- `frontend/src/contexts/AuthContext.tsx` の `handleAuthSuccess` / `logout` に `Sentry.setUser` 呼び出しを 1 行ずつ追記
- `frontend/vite.config.ts` に `@sentry/vite-plugin` を追加
- `.github/workflows/deploy-backend.yml` / `deploy-frontend-prod.yml` に `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` 注入ステップを追加
- `docs/deployment/cloud-run.md` §C6.2 / `vercel.md` §V5.3 を削除 / 差し替え、`docs/deployment/sentry.md` を新設

**Trade-offs**:

- ✅ 既存の環境変数ハブ（`ConfigService` / `envValidator`）の責務パターンをそのまま踏襲
- ✅ 新規ファイル最小（scrubber / interceptor / route-tag hook のみ）
- ✅ 1 ドメイン = 1 モジュール思想と整合
- ❌ `instrument.ts` / `main.tsx` に `beforeSend` ロジックを直書きするとテストしづらい

### Option B: Sentry 専用モジュール新設

**対象**:

- `backend/src/sentry/` ドメインモジュールを新設（`sentry.module.ts` / `sentry-user-context.interceptor.ts` / `sentry.scrubber.ts` / `sentry.tags.ts`）
- `frontend/src/sentry/` を新設（`sentryClient.ts` / `scrubber.ts` / `userSync.ts` / `useSentryRouteTag.ts`）

**Trade-offs**:

- ✅ Sentry 関連ロジックが 1 箇所に集約されテスト・差し替えしやすい
- ✅ Phase 2 の AI 連携で Webhook 受信エンドポイントを増やす際も同モジュール内で完結
- ❌ `instrument.ts` は Node 起動前（DI 生成前）に評価される特殊ファイルで、モジュール注入パターンと整合しにくい（`Sentry.init` 自体は instrument.ts に残す必要あり）
- ❌ 新規ファイル数が増える（モノレポ全体で 6〜8 ファイル）
- ❌ 「Sentry は横断的関心事」として `common/` に置く steering 規約と競合

### Option C: ハイブリッド（Option A + scrubber / interceptor 分離）

**対象**:

- `Sentry.init` は現行ファイル（`instrument.ts` / `main.tsx`）に残す
- PII scrubbing ロジックは `backend/src/common/sentry/scrubber.ts` / `frontend/src/utils/sentry/scrubber.ts` に切り出しユニットテスト可能に
- タグ付与ロジックは `backend/src/common/sentry/tags.ts` / `frontend/src/utils/sentry/tags.ts` に切り出し
- Backend の `Sentry.setUser` は **新規 `SentryUserContextInterceptor`**（`backend/src/common/sentry/sentry-user-context.interceptor.ts`）で `APP_INTERCEPTOR` グローバル登録
- Frontend の `Sentry.setUser` は既存 `AuthContext.tsx` の `handleAuthSuccess` / `logout` に 1 行ずつ副作用追加
- `useSentryRouteTag` フックは `frontend/src/hooks/useSentryRouteTag.ts` に新規配置（既存 hook ディレクトリの慣習に従う）
- Sentry 全体のモジュール化は見送り（Phase 2 で必要になれば昇格）

**Trade-offs**:

- ✅ テスト容易性（PII scrubbing / tag 付与のユニットテスト可能）と既存パターン互換性を両立
- ✅ 新規ファイル最小（Backend 3: scrubber + tags + interceptor / Frontend 3: scrubber + tags + route hook）
- ✅ steering（`common/` 配置 / `utils/` 配置）と整合
- ❌ scrubber / tags / interceptor が「Sentry 専用の common」という位置付けになる曖昧さはあるが、観測性の横断的関心事として許容範囲

---

## Recommendation for Design Phase

- **Preferred Approach**: **Option C（ハイブリッド）**
  - 理由: PII スクラビングは Req 3.6（テスト必須）に応えるためユニットテスト可能な形で切り出す必要があるが、Sentry 全体を新ドメイン化するほどの責務は無い。`common/` / `utils/` への配置は既存 steering 規約と完全に整合
  - 既存 `design.md` もこの方針で書かれており、Staging 廃止改訂を反映する形で design 側の文言調整を行えば整合する
- **Key Decisions（設計で確定済み / 要再確認）**:
  1. **単一 Sentry プロジェクト + `environment=production` 固定** → **確定**（Staging 廃止により 2 プロジェクト案は消滅）
  2. **`@sentry/vite-plugin` を採用** → **確定**（Source Map + Release 登録を一括）
  3. **Backend user 識別は新規 `SentryUserContextInterceptor`** → **確定**（`JwtAuthGuard` の単一責任を維持）
  4. **Slack 連携は Sentry ネイティブ統合（Phase 1）、Webhook + Claude は Phase 2** → **確定**
  5. **`feature_area` タグは 6 カテゴリ + `system` / `unknown`**（`memo` / `notebook` / `tag` / `theme` / `auth` / `invitation` / `system` / `unknown`）→ **確定**
  6. **PII マスクはブラックリスト + 正規表現（JWT / UUID）+ 定期監査** → **確定**
  7. **Vercel Preview は Production DSN 相乗り + `release` で識別、チャネル分離なし** → **確定**（Staging 廃止を受けた新規決定）

---

## Effort & Risk

| 項目       | 評価                                        | 根拠                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Effort** | **M（3〜7 日 / 週 5h ペースで 2〜3 週間）** | SDK は導入済で実装自体は軽量だが、CI 注入 + source map + Sentry UI 設定 + ドキュメント更新の 5 レイヤーに手を入れる必要があり範囲が広い。テストは scrubber / interceptor / AuthContext の 3 ユニット + 1 E2E                                                 |
| **Risk**   | **Low〜Medium**                             | 既存パターン拡張中心で技術リスクは低い。Source map アップロードと Vercel 環境変数の初期疎通で 1〜2 日詰まる可能性あり（Production smoke test で初回検証すれば Low まで下がる）。`vite-plugin-pwa` と `@sentry/vite-plugin` の共存は設計段階で小さな PoC 推奨 |

---

## Research Needed（設計段階で解消 / 実装前に確認）

1. **Sentry 月次無料枠の最新値**（2026-04 時点）と想定 DAU（友人公開後）で `traces 10% × profiles 10%` がどの程度の消費になるか。枠が逼迫する兆候があれば初期値を 5% に下げる
2. **`@sentry/vite-plugin` × `vite-plugin-pwa` 共存**の実動作確認（既知衝突は無いが本リポジトリで未検証。Service Worker キャッシュが `.map` を含まないことも確認）
3. **Vercel Preview デプロイで `VITE_SENTRY_RELEASE` を注入するか**（Preview でも release タグ発行のコストを許容するか）。設計上は「注入する」を推奨だが Sentry の release 個数消費に注意
4. **Sentry Webhook（Issue created）の受信契約**が Phase 2 と整合するか。`docs/deployment/sentry.md` に Webhook URL 予約欄を設けるか
5. **CLAUDE.md の環境変数セクション位置**（現行は章末デプロイ節付近）の正確なアンカー位置の決定

---

## Risks & Mitigations

- **R1: Production で Sentry 初期化失敗 → アプリ起動不可**
  → `enabled: !!SENTRY_DSN` ガード + try/catch で init を包み、初期化失敗時は `console.warn` のみで続行する fallback（設計書 Error Handling §Error Strategy）
- **R2: `beforeSend` で過度にスクラブしてデバッグ不能に**
  → ユニットテストで「redact 対象」と「保持対象」を両方 assertion + Production smoke test で意図的にエラーを起こして可読性を検証
- **R3: Source map が公開ドメインにデプロイされる**
  → `@sentry/vite-plugin` の `sourcemaps.filesToDeleteAfterUpload` 有効化 + CI の post-check（`ls dist/**/*.map` が空であることを確認）で二重化（要件 6.3）
- **R4: `SENTRY_RELEASE` 注入漏れで Sentry が未定義リリースに集約**
  → CI で `echo` して workflow summary に出力し、デプロイ後に Sentry Release 画面で新リリースが作成されていることを手動確認（Production 初回デプロイ時の smoke test に含める）
- **R5: PII スクラビングの漏れ（新規 DTO 追加時）**
  → ブラックリスト方式採用前提で、`docs/deployment/sentry.md` に「新 DTO / React component 追加時の PII チェックリスト」を整備し、PR テンプレに準拠事項を明記（要件 3.5）
- **R6: Sentry event quota 暴発**
  → サンプリング率の環境変数化で再デプロイなしに下げられる経路を確保（要件 2.4・2.5）。月 1 回の Sentry usage 画面目視を運用ルーチンに組み込む
- **R7: Vercel Preview のエラーが Production メインラインのアラートを汚染**
  → Slack チャネル分離はしないが、Sentry UI の Issue ビューで `release` フィルタを使って目視判別する運用を docs 化。Phase 2 の AI triage が `release` で分岐する前提で設計

---

## References

- `backend/src/instrument.ts` / `backend/src/app.module.ts` / `backend/src/main.ts` — 現在の初期化（先頭 import 制約）
- `backend/src/auth/jwt-auth.guard.ts` — グローバル JWT Guard + `@Public()` opt-out
- `backend/src/config/config.service.ts` — 環境変数ハブ（Sentry 系プロパティ追加先）
- `frontend/src/main.tsx` — Frontend 初期化
- `frontend/src/contexts/AuthContext.tsx` — ユーザー識別の唯一の挿入点
- `frontend/src/hooks/useAuth.ts` — **未使用の dead code**（本スペック対象外）
- `frontend/src/utils/env.ts` — 環境変数ハブ
- `frontend/vite.config.ts` — `@sentry/vite-plugin` 追加先（`VitePWA` との並び順）
- `.github/workflows/deploy-backend.yml` / `deploy-frontend-prod.yml` — リリース注入ターゲット（現状 Sentry ステップ 0）
- `docs/deployment/cloud-run.md` §C6.2 / `docs/deployment/vercel.md` §V5.3 — 旧 Sentry ガイド（要差し替え）
- `.kiro/steering/tech.md` §Key Libraries / §Key Technical Decisions — Sentry 位置付けと初期化不変条件
- `CLAUDE.md` — 環境変数節（追記先）
- External: [Sentry NestJS Integration](https://docs.sentry.io/platforms/javascript/guides/nestjs/), [@sentry/vite-plugin](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/), [Sentry Release Management](https://docs.sentry.io/product/releases/)
