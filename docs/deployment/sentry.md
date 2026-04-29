# Sentry 運用ガイド

Mosaku の Sentry 運用に関する **single source of truth**。
Cloud Run / Vercel / GitHub Actions / Slack の統合手順、Production 初回デプロイ smoke test、
ノイズ除外・PII スクラブの運用ポリシーを集約する。

> [!NOTE]
> 本ドキュメントは `.kiro/specs/sentry-integration` の Task 7（Sentry Platform 設定 + Production smoke test）と Task 8.1（ドキュメント整備）の成果物。
> Task 7 完了時点では「セットアップ / Secret 登録 / Alert Rule / Smoke test」までを記載し、Task 8.1 で「サンプリング率調整 / PII チェックリスト / ノイズ除外運用」を追記する。

---

## 0. 全体構成

| 項目         | 値                                                                           |
| ------------ | ---------------------------------------------------------------------------- |
| プロジェクト | **単一プロジェクト**（Vercel Preview も `environment: production` で相乗り） |
| Backend      | NestJS / `@sentry/nestjs` / `@sentry/profiling-node`                         |
| Frontend     | React / `@sentry/react` + `@sentry/vite-plugin`                              |
| Release ID   | `${{ github.sha }}`（Backend / Frontend 共通）                               |
| サンプリング | Production 既定 0.1（traces / profiles）                                     |
| 通知         | Sentry → Slack `#mosaku-alerts`（ネイティブ統合）                            |
| AI 連携      | Webhook / Issue-created event 受け口を有効化（Phase 2 で実装予定）           |

```
GitHub Actions (deploy-backend.yml / deploy-frontend-prod.yml)
   │
   ├── Cloud Run ── SENTRY_DSN / SENTRY_RELEASE / SENTRY_ENVIRONMENT 注入
   │       └─ NestJS Sentry SDK 初期化
   │
   ├── Vercel ──── VITE_SENTRY_DSN / VITE_SENTRY_RELEASE 注入
   │       └─ React Sentry SDK 初期化 + source map upload
   │
   └── @sentry/cli ─ release 登録 / source map upload
           ↓
        Sentry Issue
           ↓
       Slack #mosaku-alerts（first-seen / regression）
           ↓
       Webhook → Phase 2 AI pipeline（後続）
```

---

## 1. Sentry プロジェクトのセットアップ

> Task 7.1（Requirements 1.1, 1.7）

### 1.1 アカウント / Organization

1. [https://sentry.io/](https://sentry.io/) でアカウント作成（Developer プランで開始、無料枠 5K events/月）。
2. Organization slug を決定（例: `mosaku`）。GitHub Secrets の `SENTRY_ORG` に投入する値。

### 1.2 プロジェクト作成（単一プロジェクト構成）

| プロジェクト | Platform           | 用途                                       |
| ------------ | ------------------ | ------------------------------------------ |
| `backend`    | Node.js (NestJS)   | Cloud Run 上の API エラー / パフォーマンス |
| `frontend`   | JavaScript (React) | Vercel Production / Preview の両方         |

- Vercel Preview は **別プロジェクトを作らず**、Production と同じ `frontend` プロジェクトに `environment: production` タグで相乗りする。
- Preview と Production の識別は `release` タグ（git sha）で行う。

### 1.3 DSN の取得

各プロジェクトの **Settings → Client Keys (DSN)** から以下の値をコピーする:

- Backend `dsn` → Cloud Run Secret Manager の `sentry-dsn` に登録
- Frontend `dsn` → Vercel Environment Variables の `VITE_SENTRY_DSN` に登録（Production / Preview 両方）

### 1.4 Auth Token の発行

**User Settings → Auth Tokens → Create New Token** で発行。

| 設定       | 値                                                |
| ---------- | ------------------------------------------------- |
| Name       | `mosaku-ci-release-management`                    |
| Scopes     | `project:releases`（**Release Management のみ**） |
| Expiration | 1 年（毎年 4 月にローテ）                         |

> [!WARNING]
> `org:read` や `event:admin` 等の余計な scope は付けない。漏洩時の影響範囲を最小化するため Release 専用に絞る。

### 1.5 Project ID（Slug）の確認

- **Settings → General Settings → Project Slug** で確認
- Backend slug → `SENTRY_PROJECT_BACKEND`
- Frontend slug → `SENTRY_PROJECT_FRONTEND`

---

## 2. Secret 登録手順

> Task 7.1（Requirements 1.1, 1.7）

### 2.1 Cloud Run Secret Manager（Backend）

```bash
# DSN を Secret Manager に登録
echo -n 'https://<public-key>@<org>.ingest.sentry.io/<project-id>' \
  | gcloud secrets create sentry-dsn --data-file=- --project=mosaku-prod

# Cloud Run サービスアカウントに secretAccessor 権限を付与
gcloud secrets add-iam-policy-binding sentry-dsn \
  --member="serviceAccount:<service-account-email>" \
  --role="roles/secretmanager.secretAccessor" \
  --project=mosaku-prod
```

`deploy-backend.yml` は `--update-secrets` 経由で `SENTRY_DSN=sentry-dsn:latest` を参照する。

### 2.2 GitHub Secrets（CI 共通）

**Repo → Settings → Secrets and variables → Actions** で以下を登録する:

| Secret Name               | 値                        | 用途                                              |
| ------------------------- | ------------------------- | ------------------------------------------------- |
| `SENTRY_AUTH_TOKEN`       | §1.4 で発行した token     | `@sentry/cli` の release 登録 / source map upload |
| `SENTRY_ORG`              | §1.1 の organization slug | release 登録時の組織識別                          |
| `SENTRY_PROJECT_BACKEND`  | §1.5 の Backend slug      | Backend release 登録                              |
| `SENTRY_PROJECT_FRONTEND` | §1.5 の Frontend slug     | Frontend release 登録 + source map upload         |

> [!IMPORTANT]
> `SLACK_WEBHOOK_URL` は CI 通知（GitHub Actions → Slack）専用で、Sentry → Slack 連携には触らない。Sentry → Slack はネイティブ統合（§3.2）で行う。

### 2.3 Vercel Environment Variables（Frontend）

**Vercel Project → Settings → Environment Variables** に登録する:

| 変数名                           | Environment         | 値                               |
| -------------------------------- | ------------------- | -------------------------------- |
| `VITE_SENTRY_DSN`                | Production, Preview | §1.3 の Frontend DSN             |
| `VITE_SENTRY_ENVIRONMENT`        | Production, Preview | `production`                     |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Production, Preview | `0.1`（任意、未指定時 SDK 既定） |

> `VITE_SENTRY_RELEASE` は CI から build 時に `${{ github.sha }}` を渡すので、Vercel の Env には登録しない。

### 2.4 DSN ローテ手順

DSN が漏洩した、または定期ローテで切り替えたいときの手順。

1. Sentry UI で **Settings → Client Keys (DSN)** から **Create New Key** で新 DSN を発行
2. Cloud Run: `gcloud secrets versions add sentry-dsn --data-file=-` で新 version を追加 → 次回デプロイで反映
3. Vercel: `VITE_SENTRY_DSN` の値を新 DSN に書き換え → **Redeploy** で反映
4. 旧 DSN を Sentry UI で **Disable** → 24h 観測 → **Delete**
5. ローテ完了を `docs/progress.md` に記録（誰がいつ何故ローテしたか）

### 2.5 Auth Token ローテ手順

Auth Token は **毎年 4 月の月次振り返り** で更新する運用。

1. §1.4 で新 token を発行
2. GitHub Secrets の `SENTRY_AUTH_TOKEN` を新 token に書き換え
3. 直近の deploy ワークフローを手動 trigger して release 登録が成功することを確認
4. Sentry UI で旧 token を **Revoke**

---

## 3. Alert Rule と Slack 連携

> Task 7.2（Requirements 8.1〜8.6, 9.4, 9.5）

### 3.1 Alert Rule（Production 限定）

**Sentry → Alerts → Create Alert** から **Issue Alert** を 2 つ作成する。

#### Rule 1: First-seen（新規 issue）

| 項目          | 値                                              |
| ------------- | ----------------------------------------------- |
| Name          | `production / first-seen`                       |
| Environment   | `production`                                    |
| When          | A new issue is created                          |
| If            | The event's level equals or higher than `error` |
| Then (Action) | Send a notification to Slack `#mosaku-alerts`   |
| Frequency     | At most once every 1 minute                     |

#### Rule 2: Regression（再発 issue）

| 項目          | 値                                            |
| ------------- | --------------------------------------------- |
| Name          | `production / regression`                     |
| Environment   | `production`                                  |
| When          | A regression issue happens                    |
| Then (Action) | Send a notification to Slack `#mosaku-alerts` |
| Frequency     | At most once every 1 minute                   |

> [!NOTE]
> `release` 単位でチャネルを分岐する設定は **行わない**（個人運用で複雑化を避ける fire-and-forget 構成）。

### 3.2 Slack ネイティブ統合

1. **Sentry → Settings → Integrations → Slack** で **Add Workspace** をクリック
2. Slack ワークスペース（`mosaku.slack.com`）を認可
3. Default channel を `#mosaku-alerts` に設定
4. Alert Rule の Action から `Send a Slack notification to the Mosaku workspace` を選択 → channel に `#mosaku-alerts` を指定

#### Alert payload に含まれる項目（確認用チェックリスト）

- [ ] Issue title
- [ ] Environment（`production`）
- [ ] Release（git sha 7 桁）
- [ ] 影響ユーザー数（`users affected`）
- [ ] Sentry Issue へのリンク

> Slack の rate-limit 時のリトライは Sentry 側に任せる（リトライロジックを Mosaku 側で組まない）。

### 3.3 Webhook / Issue-created event の受け口

Phase 2 で実装予定の **AI による Issue 自動分析 pipeline** の前提として、Sentry 側で Webhook を有効化しておく。

1. **Sentry → Settings → Integrations → Internal Integration** で **Create New Integration** を選択
2. Name: `mosaku-ai-pipeline`
3. Webhook URL: **空欄のままでも作成可能**。Phase 2 で受信エンドポイントが用意できた時点で URL を更新する
4. Subscribe to: `issue.created` / `issue.resolved` / `issue.unresolved`
5. Permissions: `Issue & Event: Read`

> [!NOTE]
> 本スペックでは AI 側のロジックは実装しない。あくまで「後付けで subscribe できる状態」にしておくことが目的。

---

## 4. Production 初回デプロイ smoke test

> Task 7.3（Requirements 6.5）

### 4.1 前提

- §1〜§3 の設定がすべて完了していること
- `deploy-backend.yml` / `deploy-frontend-prod.yml` が `${{ github.sha }}` を release として渡している（Task 6.1 / 6.2 で実装済み）
- Cloud Run / Vercel に最新のリリースがデプロイ済み

### 4.2 Backend smoke test（`/debug-sentry` エンドポイント経由）

Backend には Production smoke test 用の意図的エラー発火エンドポイントが実装されている（`backend/src/app.controller.ts:23` の `debugSentry()`）。普段は 404 を返し、`SENTRY_DEBUG_ENABLED=true` の env が立っている間だけ有効化される。

#### 手順

1. **smoke test 用 env を一時投入**

   ```bash
   gcloud run services update mosaku-backend \
     --region=asia-northeast1 \
     --update-env-vars=SENTRY_DEBUG_ENABLED=true \
     --project=mosaku-prod
   ```

2. **エラー発火**

   ```bash
   curl -i https://<cloud-run-url>/debug-sentry
   # 期待結果: HTTP/1.1 500 Internal Server Error
   # （SentrySmokeTestError がスローされ Sentry に送信される）
   ```

3. **Sentry UI で確認**（10 分以内に届くはず）
   - Issue タイトルが `SentrySmokeTestError: Sentry production smoke test - intentional error`
   - `environment: production`
   - `release: <git-sha>`
   - `feature_area: system`（または `unknown`）
   - `transaction: AppController.debugSentry`
   - source map による可読スタックトレース

4. **Slack `#mosaku-alerts` に通知が届くことを確認**
   - issue link から直接 Sentry Issue に到達できる
   - payload に release / environment / 影響ユーザー数が含まれる

5. **smoke test 用 env を即削除**（重要！）

   ```bash
   gcloud run services update mosaku-backend \
     --region=asia-northeast1 \
     --remove-env-vars=SENTRY_DEBUG_ENABLED \
     --project=mosaku-prod
   ```

6. **無効化の確認**

   ```bash
   curl -i https://<cloud-run-url>/debug-sentry
   # 期待結果: HTTP/1.1 404 Not Found
   ```

> [!CAUTION]
> `SENTRY_DEBUG_ENABLED=true` を投入したまま放置すると、誰でも Sentry にイベントを発火させて quota を消費できる状態になる。**smoke test 完了後は必ず env を削除する**。手順 5 / 6 をスキップしないこと。

### 4.3 Frontend smoke test（ブラウザコンソール経由）

Frontend には専用の発火エンドポイントを設けず、ブラウザコンソールから直接 throw する方式で smoke test を行う。

#### 手順

1. Production URL（`https://mosaku.app` など）または最新の Vercel Preview を開く
2. ブラウザの DevTools コンソールで以下を実行

   ```js
   // SDK が公開する captureException を直接呼ぶか、未捕捉エラーを発生させる
   throw new Error('Frontend Sentry smoke test - intentional error');
   ```

3. **Sentry UI で確認**
   - Issue タイトルに `Frontend Sentry smoke test - intentional error`
   - `environment: production`
   - `release: <git-sha>`
   - `route: <現在の pathname>`（`useSentryRouteTag` フック経由）
   - source map による可読スタックトレース（`*.map` が公開物から削除されていても、Sentry 側に upload 済みなので可読化される）

4. **Slack `#mosaku-alerts`** にも通知が届くことを確認

### 4.4 PII マスク確認（最重要）

Sentry Issue の **JSON Payload** タブで以下を目視確認する:

- [ ] `request.data.content` が `[REDACTED]`（メモ本文がマスクされている）
- [ ] `request.data.body` が `[REDACTED]`
- [ ] `extra.invitationCode` が `[REDACTED]`
- [ ] JWT 風文字列（`eyJ...` で始まる string）が `[REDACTED]`
- [ ] `user` フィールドに **id 以外** が含まれていない（email / OAuth provider / IP は絶対 NG）

> [!WARNING]
> マスク漏れを 1 件でも検出した場合は即座に `instrument.ts` の scrubber 設定（`backend/src/common/sentry/sentry-scrubber.ts`）を見直し、再 deploy する。

### 4.5 確認チェックリスト（コピペ用）

```
[ ] Backend /debug-sentry が 500 を返す（SENTRY_DEBUG_ENABLED=true 時）
[ ] Sentry UI に release: <sha> / environment: production が反映
[ ] feature_area / route / controller / handler タグが付与
[ ] source map による可読スタックトレース
[ ] Slack #mosaku-alerts に通知到達
[ ] PII（メモ本文 / 招待コード / JWT）が [REDACTED]
[ ] user フィールドが id のみ（email / OAuth provider が含まれない）
[ ] SENTRY_DEBUG_ENABLED=true env を削除
[ ] /debug-sentry が 404 を返すことを再確認
[ ] Frontend ブラウザコンソールから throw → Sentry 到達
[ ] Frontend route タグが pathname と一致
```

---

## 5. サンプリング率の調整

> [!NOTE]
> 本セクションは Task 8.1 で詳細を追記する。MVP では「env で変更できる」という最低限の情報のみ記載する。

サンプリング率は env で動的に変更可能（再デプロイ不要、Cloud Run の env 更新で即時反映）:

- Backend: `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE`
- Frontend: `VITE_SENTRY_TRACES_SAMPLE_RATE`（Vercel Env、再 build が必要）

月次 quota 逼迫時は 0.1 → 0.05 → 0.02 と段階的に下げる。

---

## 6. PII スクラブ運用

> [!NOTE]
> 本セクションは Task 8.1 で詳細を追記する（対象キー一覧 / 新規 DTO 追加チェックリスト）。

スクラブ実装は以下:

- Backend: `backend/src/common/sentry/sentry-scrubber.ts`
- Frontend: `frontend/src/utils/sentry/sentry-scrubber.ts`

---

## 7. ノイズ除外ルール

> [!NOTE]
> 本セクションは Task 8.1 で詳細を追記する（追加時のレビュー基準を含む）。

- Backend `ignoreErrors`: `backend/src/instrument.ts`
- Frontend `ignoreErrors` / `denyUrls`: `frontend/src/utils/sentry/init.ts`

---

## 8. Phase 2 AI pipeline 連携の参照ポイント

Phase 2 で実装予定の **Sentry Issue → AI 自動分析 pipeline** が参照する API / データ:

- Webhook 受け口: §3.3 で作成した Internal Integration の `issue.created` event
- Sentry API: `GET /api/0/projects/{org}/{project}/issues/` で issue 一覧取得
- Auth Token scope: 受信側でも `Issue & Event: Read` が必要（§1.4 とは別 token を発行する）

> 本スペックでは AI 側のロジックは実装しない。Phase 2 着手時に本ドキュメントの §3.3 を出発点とすること。
