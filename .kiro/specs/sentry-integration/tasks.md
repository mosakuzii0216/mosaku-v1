# Implementation Plan

## 概要

- **機能**: sentry-integration（Sentry を個人開発者が週 5 時間で運用できる本番監視基盤に引き上げる）
- **総タスク**: 8 メジャータスク / 22 サブタスク（概算 30 時間）
- **範囲**: Backend（NestJS）/ Frontend（React）/ CI / Sentry Platform / ドキュメント
- **並行性**: 共通コンポーネント層・CI ワークフロー・ドキュメントは並列実装可能（`(P)` マーカー）

---

## Tasks

- [x] 1. Backend Sentry 共通コンポーネント層の実装
- [x] 1.1 (P) Backend の PII スクラブ純関数を実装してメモ本文・招待コード・JWT・OAuth 機密を `[REDACTED]` に置換する
  - キー名ブラックリスト（`content` / `body` / `html` / `code` / `password` / `token` / `invitationCode` / `clientSecret` 等）と値の正規表現（JWT 風 / UUID 風）の二軸で redact する
  - event の `request.data` / `request.headers` / `contexts` / `extra` / `breadcrumbs[].data` を再帰走査し、循環参照を `WeakSet` でガードする
  - 巨大文字列（>10KB）は truncate してから redact する純関数として実装し、元 event を破壊変更しない
  - メモ本文 / 招待コード / JWT 形式文字列がそれぞれ `[REDACTED]` に置換されるユニットテストを追加する
  - _Requirements: 3.1, 3.3, 3.6_

- [x] 1.2 (P) Backend の構造化タグ付与関数を実装して `feature_area` / `user_facing` / `controller` / `handler` / `route` を event に付与する
  - `request.url` の prefix から `feature_area`（`memo` / `notebook` / `tag` / `theme` / `auth` / `invitation` / `system` / `unknown`）を解決する map を用意する
  - NestJS が example 経路で埋め込む `transaction` プロパティから controller 名 / handler 名を抽出してタグ化する
  - `contexts.response.status_code` が 5xx のときのみ `user_facing: true` を付与する
  - `/memo/123` / `/notebook/abc` / `/auth/login` の 3 URL で `feature_area` が正しく解決されるユニットテストを追加する
  - _Requirements: 9.1, 9.2_

- [x] 1.3 (P) ConfigService に Sentry 関連設定（DSN / environment / release / サンプリング率）の型安全ゲッターを追加する
  - `ConfigService.sentry` を `SentryConfig` 型（`dsn?` / `environment` / `release?` / `tracesSampleRate` / `profilesSampleRate`）として公開する
  - env 名を `SENTRY_ENV_KEYS` 定数として Backend 共通に export し `instrument.ts` と重複参照しても齟齬を起こさないようにする
  - サンプリング率は `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE` を `parseFloat` し、未設定時は `environment === 'production' ? 0.1 : 0` をデフォルトとする
  - _Requirements: 1.2, 2.5_

- [x] 1.4 (P) 認証済みリクエストで Sentry scope に `{ id: userId }` のみを設定するグローバル Interceptor を実装する
  - `ExecutionContext` から `req.user.id` を取得できた場合にのみ scope に user を設定し、email / username / OAuth provider / IP は絶対に渡さない
  - 公開ルート（`req.user` 未セット）では `setUser` を呼ばず scope を匿名のままにする契約をユニットテストで検証する
  - `@sentry/nestjs` の `Sentry.getCurrentScope` を利用し、Guard の単一責任を崩さない side-car 実装とする
  - _Requirements: 4.3, 4.4, 4.5_

- [x] 2. Backend Sentry SDK の初期化強化と AppModule 統合
  - `instrument.ts` で `Sentry.init` を拡張し `sendDefaultPii: false` / `environment` / `release` / `sampleRate: 1.0` / `tracesSampleRate` / `profilesSampleRate` を `process.env` から読み込む
  - `beforeSend` に scrubber と構造化タグ付与関数を合成して注入し、すべての捕捉経路で PII redaction と タグ付与が通過することを保証する
  - `ignoreErrors` に `NotFoundException` / `ThrottlerException` 非該当の 4xx クラスを登録し、各エントリに除外理由のコメントを必ず添える
  - DSN 未設定時は初期化をスキップし `Sentry disabled: SENTRY_DSN not set` を stdout に 1 行出力する
  - `SENTRY_RELEASE` 未設定時は release を省略し、`Sentry.init` 自体の例外は try/catch で握りつぶして起動を妨げない
  - `AppModule` の providers に `APP_INTERCEPTOR` として Task 1.4 の Interceptor をグローバル登録する
  - 認証済み `/memo` と公開 `/auth/invitation-validate` に対する e2e テストで scope 挙動（ユーザー ID 付与 / 匿名維持）を検証する
  - _Requirements: 1.2, 1.4, 1.5, 1.6, 2.1, 2.2, 2.5, 2.6, 3.4, 4.3, 4.4, 5.3, 5.6, 7.2, 7.5, 10.3_

- [x] 3. Frontend Sentry 共通コンポーネント層の実装
- [x] 3.1 (P) Frontend の PII スクラブ純関数を実装し TipTap JSON ドキュメント・React Query cache snapshot・form state を `[REDACTED]` 化する
  - Backend scrubber と同じ契約（キー名ブラックリスト + 値の正規表現）を共有し、`breadcrumbs[].data` と `formData` も走査対象とする
  - TipTap の `content` プロパティ（JSON ドキュメント）は深さ制限 4 階層で text ノードを `[REDACTED]` に置換する
  - メモ本文を含む event と招待コードを含む event それぞれが redact されるユニットテストを追加する
  - _Requirements: 3.2, 3.3, 3.6_

- [x] 3.2 (P) envValidator を拡張し Sentry 関連 env を optional 型安全に取得できるようにする
  - `sentryDsn` / `sentryEnvironment` / `sentryRelease` / `sentryTracesSampleRate` を `EnvConfig` に追加する
  - DSN のみ存在し environment 未指定の場合は `production` に fallback するバリデーションを入れる
  - 既存 env の挙動に regression が出ないことをユニットテストで担保する
  - _Requirements: 1.3, 2.5_

- [x] 3.3 (P) React Router v7 の pathname 変化を Sentry タグ `route` に同期する `useSentryRouteTag` フックを実装する
  - `useLocation` + `useEffect` で pathname を監視し `Sentry.getCurrentScope().setTag('route', pathname)` を呼ぶ
  - 2 route 遷移で setTag が 2 回呼ばれることを vitest + react-router test utilities で検証する
  - 動的セグメントの high-cardinality 問題は MVP では pathname そのまま送信し、パターン化は後続改善として detail コメントに残す
  - _Requirements: 9.1, 9.3_

- [x] 4. Frontend Sentry SDK 初期化と認証 / ルーティング層への統合
- [x] 4.1 (P) `main.tsx` の `Sentry.init` を Production 運用レベルに拡張する
  - `enabled: !!VITE_SENTRY_DSN` ガードを維持し、未設定時は初期化スキップと `Sentry disabled: VITE_SENTRY_DSN not set` の 1 行ログを出力する
  - `environment` / `release` / `tracesSampleRate` / `sendDefaultPii: false` を env 経由で設定し、ローカル開発は既定でサンプリング 0
  - `reactRouterV7BrowserTracingIntegration` を組み込み route ベース transaction を開始する
  - `ignoreErrors` に `AbortError` / `NetworkError: Failed to fetch` / `Load failed` / ブラウザ拡張由来エラーを登録し、`denyUrls` で `chrome-extension://` / `moz-extension://` を除外する（各ルールに理由コメントを添える）
  - `beforeSend` に Task 3.1 の scrubber を渡し、`release` 未設定時は SDK の fallback に任せる
  - Vercel Preview でも `environment: production` で初期化し `release` タグ（git sha）でメインラインと識別できる構成にする
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 2.5, 2.6, 3.4, 5.4, 5.6, 7.1, 7.3, 7.5, 10.3_

- [x] 4.2 (P) `AuthContext` の認証フローに `Sentry.setUser` 副作用を追加する
  - `handleAuthSuccess` 成功後に `Sentry.setUser({ id: userProfile.id })` のみを呼び、email / OAuth provider / display name を絶対に渡さない
  - `logout` と token refresh 失敗ルートで `Sentry.setUser(null)` を呼び scope を明示的にクリアする
  - login → logout のフローで id → null の順に呼ばれること、email / OAuth 情報が引数に含まれないことを単体テストで検証する
  - _Requirements: 4.1, 4.2, 4.5_

- [x] 4.3 (P) `App.tsx` で `useSentryRouteTag` を配置し実行時に route タグを継続反映する
  - `RouterProvider` 配下で 1 回だけ呼び出し、各画面遷移で setTag が自動更新される状態にする
  - 既存の App 初期化ロジックや Suspense 境界と干渉しないことを smoke レベルで確認する
  - _Requirements: 9.1, 9.3_

- [ ] 5. (P) Vite ビルドに `@sentry/vite-plugin` を組み込み Source Map を Sentry にアップロードしつつ公開物から削除する
  - `vite.config.ts` の plugins に `@sentry/vite-plugin` を `VitePWA` の後に追加し、`VITE_SENTRY_RELEASE` を release 名として渡す
  - `build.sourcemap: true` を有効化しつつ `sourcemaps.filesToDeleteAfterUpload: ['**/*.js.map']` で最終成果物から `.map` を除去する
  - `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` 未設定時は `disable: true` で plugin を自動無効化し、ローカルビルドや PR プレビューを壊さない
  - source map upload 失敗は CI の warning に留めデプロイをブロックしない挙動を確認する
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 6. CI ワークフローに Sentry リリース情報とトークン管理を注入する
- [ ] 6.1 (P) Backend デプロイワークフロー（`deploy-backend.yml`）を拡張し Cloud Run に `SENTRY_RELEASE` / `SENTRY_ENVIRONMENT` / サンプリング率 env を投入する
  - Cloud Run の `--set-env-vars` に `SENTRY_RELEASE=${{ github.sha }}` / `SENTRY_ENVIRONMENT=production` / `SENTRY_TRACES_SAMPLE_RATE=0.1` / `SENTRY_PROFILES_SAMPLE_RATE=0.1` を追加する
  - deploy 後に `npx @sentry/cli releases new` → `set-commits --auto` → `finalize` を実行する release ジョブを追加する
  - 新規 GitHub Secrets（`SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT_BACKEND`）を参照できるよう env を定義する
  - 既存 `SLACK_WEBHOOK_URL` は CI 通知専用として触らない（Sentry → Slack はネイティブ統合側に寄せる）
  - _Requirements: 5.1, 5.5_

- [ ] 6.2 (P) Frontend デプロイワークフロー（`deploy-frontend-prod.yml`）を拡張し Vercel ビルドに `VITE_SENTRY_RELEASE` と `SENTRY_AUTH_TOKEN` を渡す
  - `build-check` と `deploy` の両ジョブに `VITE_SENTRY_RELEASE: ${{ github.sha }}` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT_FRONTEND` を export する
  - vite-plugin がリリース登録と source map upload を担うため CLI 呼び出しは fallback 用にのみ残し、失敗時は warning ログだけに留めデプロイを止めない
  - build 後の post-check で `dist/**/*.map` が空であることを確認し、万一 map が残っている場合はジョブを fail させる
  - _Requirements: 5.2, 5.5, 6.4_

- [ ] 7. Sentry Platform 設定と Production 初回 smoke test
- [ ] 7.1 Sentry Production プロジェクトを作成し DSN / Auth Token を Cloud Run Secret Manager / Vercel / GitHub Secrets に投入する
  - 単一 Sentry プロジェクトを作成し Vercel Preview も相乗りで `environment: production` タグ運用とする
  - Cloud Run 側は Secret Manager に `sentry-dsn` を登録し `deploy-backend.yml` から参照する
  - Vercel 側は `VITE_SENTRY_DSN` / `VITE_SENTRY_ENVIRONMENT` を Production / Preview 両方の環境変数に登録する
  - `SENTRY_AUTH_TOKEN` は Release Management 権限のみに絞り GitHub Secrets に登録する
  - _Requirements: 1.1, 1.7_

- [ ] 7.2 Sentry Alert Rule と Slack ネイティブ統合を Production 環境限定で設定する
  - first-seen（Production の新規 issue）と regression（Production の再発 issue）の 2 ルールを作成し Slack `#mosaku-alerts` に通知させる
  - alert payload に issue title / environment / release / 影響ユーザー数 / Sentry リンクが含まれることを確認する
  - Slack rate-limit 時のリトライは Sentry 側に任せる fire-and-forget 構成とし、per-`release` のチャネル分岐は行わない
  - Webhook / Issue-created event の受け口を有効化し Phase 2 の AI pipeline が後付けで subscribe できる状態にする（本スペックでは AI ロジックは実装しない）
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.4, 9.5_

- [ ] 7.3 Production 初回デプロイ後の smoke test を実施して release タグ・可読スタック・Slack 通知を検証する
  - Vercel Preview または Production で意図的なエラー（一時エンドポイントまたはブラウザコンソールからの `throw`）を発生させる
  - Sentry UI 上で `environment: production` / `release: <git-sha>` / `feature_area` / `route` タグと source map による可読スタックトレースが 10 分以内に揃うことを確認する
  - Slack `#mosaku-alerts` に通知が届き、issue link から直接 Sentry Issue に到達できることを確認する
  - PII マスク漏れが無いこと（メモ本文 / 招待コード / JWT が `[REDACTED]` になっていること）を event payload で目視確認する
  - _Requirements: 6.5_

- [ ] 8. ドキュメントと Steering の最新化
- [ ] 8.1 (P) `docs/deployment/sentry.md` を新規作成し Sentry 運用の single source of truth にする
  - Sentry プロジェクトセットアップ手順 / DSN 登録手順（Cloud Run Secret Manager + Vercel Env） / DSN ローテ手順を記載する
  - サンプリング率調整方法（env のみで変更可能なことと月次 quota 逼迫時の下げ方）を記載する
  - PII スクラブの対象キー一覧と「新規 DTO 追加時のチェックリスト」を記載する
  - ノイズ除外ルール一覧（Frontend `ignoreErrors` / `denyUrls`、Backend 4xx 除外）と追加時のレビュー基準を記載する
  - Alert Rule 設定と Slack `#mosaku-alerts` 連携の再現手順を記載する
  - Production 初回デプロイ smoke test 手順（意図的エラー → 10 分以内の可読スタック確認）を記載する
  - Sentry Webhook / Issue-created event の受け口設定と Phase 2 AI pipeline 連携時の参照ポイントを記載する
  - _Requirements: 1.1, 1.7, 3.5, 6.5, 7.4, 8.5, 9.4, 10.1_

- [ ] 8.2 (P) `.kiro/steering/tech.md` と `CLAUDE.md` に最終構成を反映する
  - tech.md に Sentry 初期化パターン（Production 単一運用 / サンプリング戦略 / PII ポリシー / 構造化タグ契約）を追記する
  - `CLAUDE.md` の環境変数セクションに `SENTRY_DSN` / `VITE_SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` / `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE` / `VITE_SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT_BACKEND` / `SENTRY_PROJECT_FRONTEND` を追記する
  - _Requirements: 10.2, 10.4_

- [ ] 8.3 (P) `docs/deployment/cloud-run.md` と `docs/deployment/vercel.md` の旧 Sentry セクションを整理し `sentry.md` へ誘導する
  - cloud-run.md §C6.2 と vercel.md §V5.3 の古い内容を削除または要約し、詳細は `docs/deployment/sentry.md` を参照する構成に切り替える
  - 残す記述は Cloud Run / Vercel 固有の env 投入チェックリストのみに絞る
  - _Requirements: 10.5_

---

## Requirements Coverage Summary

| Requirement   | Covered by Task  |
| ------------- | ---------------- |
| 1.1           | 7.1, 8.1         |
| 1.2           | 1.3, 2           |
| 1.3           | 3.2, 4.1         |
| 1.4           | 4.1, 6.2         |
| 1.5           | 2, 4.1           |
| 1.6           | 2, 4.1           |
| 1.7           | 7.1, 8.1         |
| 2.1, 2.2      | 2                |
| 2.3, 2.4      | 4.1              |
| 2.5           | 1.3, 2, 3.2, 4.1 |
| 2.6           | 2, 4.1           |
| 3.1, 3.3, 3.6 | 1.1              |
| 3.2           | 3.1              |
| 3.4           | 2, 4.1           |
| 3.5           | 8.1              |
| 4.1, 4.2      | 4.2              |
| 4.3, 4.4, 4.5 | 1.4, 2, 4.2      |
| 5.1           | 6.1              |
| 5.2           | 6.2              |
| 5.3           | 2                |
| 5.4           | 4.1              |
| 5.5           | 6.1, 6.2         |
| 5.6           | 2, 4.1           |
| 6.1, 6.2, 6.3 | 5                |
| 6.4           | 5, 6.2           |
| 6.5           | 7.3              |
| 7.1           | 4.1              |
| 7.2           | 2                |
| 7.3           | 4.1              |
| 7.4           | 8.1              |
| 7.5           | 2, 4.1           |
| 8.1–8.6       | 7.2              |
| 9.1           | 1.2, 3.3, 4.3    |
| 9.2           | 1.2              |
| 9.3           | 3.3, 4.3         |
| 9.4           | 7.2, 8.1         |
| 9.5           | 7.2              |
| 10.1          | 8.1              |
| 10.2          | 8.2              |
| 10.3          | 2, 4.1           |
| 10.4          | 8.2              |
| 10.5          | 8.3              |
