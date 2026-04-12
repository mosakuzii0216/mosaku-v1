# CI/CD パイプライン現状分析とレビュー

> 作成日: 2026-04-13
> 対象: `.github/workflows/` 配下 8 ワークフロー

## 1. 全体像

現状は **8 ワークフロー構成**。PR チェック → main push で stg 自動デプロイ → 手動承認で prod デプロイ、という流れ。

### ワークフロー一覧

| ファイル                     | 役割                                            | トリガー                  |
| ---------------------------- | ----------------------------------------------- | ------------------------- |
| `lint.yml`                   | frontend/backend の Prettier・ESLint・tsc       | PR / main push            |
| `build-frontend.yml`         | frontend の Vite ビルド確認                     | PR (frontend/\*\*)        |
| `test-backend.yml`           | backend の unit test + E2E（PG コンテナ）       | PR (backend/\*\*)         |
| `security.yml`               | npm audit + CodeQL                              | PR / 週次 / 手動          |
| `deploy-backend-staging.yml` | Cloud Run (mosaku-backend-staging) 自動デプロイ | main push (backend/\*\*)  |
| `deploy-frontend.yml`        | Vercel Preview 自動デプロイ (stg 相当)          | main push (frontend/\*\*) |
| `deploy-backend.yml`         | Cloud Run (mosaku-backend) 本番デプロイ         | 手動のみ                  |
| `deploy-frontend-prod.yml`   | Vercel Production 本番デプロイ                  | 手動のみ                  |

### フロー図

```
[Pull Request]
  ├─ lint.yml              (frontend/backend lint + 型チェック)
  ├─ build-frontend.yml    (frontend ビルド確認)
  ├─ test-backend.yml      (backend unit + E2E, PG 起動)
  └─ security.yml          (npm audit + CodeQL)
          ↓ merge
[main push]
  ├─ deploy-backend-staging.yml → Cloud Run (mosaku-backend-staging)
  │    └─ migrate-staging (STAGING_DIRECT_URL)
  └─ deploy-frontend.yml        → Vercel Preview
          ↓ 手動承認 (environment: production)
[workflow_dispatch]
  ├─ deploy-backend.yml         → Cloud Run (mosaku-backend)
  │    └─ migrate (PROD_DIRECT_URL)
  └─ deploy-frontend-prod.yml   → Vercel Production
```

### 良いところ

- stg / prod のワークフローが明確に分離されている
- prod デプロイに `environment: production` で承認ゲートが効いている
- Docker イメージに `github.sha` タグが付いていてトレーサビリティがある
- Prisma マイグレーションが `migrate deploy` でちゃんと分離されている
- PR 時に PG サービスコンテナで実 DB に対する E2E が走っている

---

## 2. 課題一覧

### 🔴 Critical

#### C-1. Container Registry (`gcr.io`) がサービス終了している可能性

- 該当: `deploy-backend.yml:41`, `deploy-backend-staging.yml:38`
- 現状: `IMAGE_NAME: gcr.io/igneous-core-480923-j0/mosaku-backend`
- 問題: **gcr.io (Container Registry) は 2024 年 3 月に廃止、2025 年 3 月で完全終了**。2026 年 4 月時点では動作しない可能性が高い。
- 対応:
  - Artifact Registry に移行
  - 例: `asia-northeast1-docker.pkg.dev/igneous-core-480923-j0/mosaku/backend`
  - 直近のデプロイ実績を `gh run list --workflow=deploy-backend-staging.yml` で確認すること

#### C-2. staging DB マイグレーションが無条件自動実行される

- 該当: `deploy-backend-staging.yml:80-109`
- 現状: `migrate-staging` ジョブに `environment` 指定がなく、main push で即座に実行される
- 問題: 破壊的マイグレーション (DROP COLUMN など) が main に混入した場合、**人間の承認なしで stg DB に適用される**。stg が本番と同じスキーマ設計なら事実上 prod への予行演習が失敗する。
- 対応:
  - `environment: staging` を設定して最低限ログと承認可否を記録
  - または `prisma migrate status` での事前確認ステップを追加

#### C-3. Playwright E2E が CI で実行されていない

- 該当: commit `8bda843 test(e2e): Playwright E2E テストとパフォーマンス検証を追加する`
- 現状: frontend に Playwright E2E が追加されたが、**どの workflow からも `playwright test` を呼んでいない**
- 問題: E2E テストを書いても自動実行されないため、regression を検知できない
- 対応: 専用 workflow もしくは `build-frontend.yml` に E2E ステップを追加

---

### 🟠 High

#### H-1. GCP 認証が長寿命サービスアカウントキー

- 該当: `deploy-backend.yml:181`, `deploy-backend-staging.yml:126`
- 現状: `GCP_SA_KEY`（SA JSON キー）を GitHub Secrets に保存
- 問題: 鍵漏洩時のローテが面倒、監査がしづらい、GCP としても非推奨
- 対応: **Workload Identity Federation (WIF)** に移行
  ```yaml
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: projects/XXX/locations/global/workloadIdentityPools/github/providers/github
      service_account: deployer@igneous-core-480923-j0.iam.gserviceaccount.com
  ```

#### H-2. Frontend のテストが PR 時に走っていない

- 該当: `build-frontend.yml`, `lint.yml`
- 現状: frontend に Vitest の設定があるが（`vitest.config` も最近更新されている）、PR 時に `npm run test -w frontend` を実行する workflow が存在しない
- 対応: `test-frontend.yml` を新設、または `build-frontend.yml` にテストステップを追加

#### H-3. stg デプロイ前に E2E が走らない

- 該当: `deploy-backend-staging.yml:71`
- 現状: `npm run test` のみで E2E が抜けている。PR 時は test-backend.yml で E2E が走るが、複数 PR が連続マージされると **E2E 未検証状態で stg に出る可能性**がある
- 対応: `test` ジョブに `npm run test:e2e` を追加する（PG サービスコンテナも必要）

#### H-4. ロールバック手段が自動化されていない

- 現状: イメージに SHA タグが付いているが、過去イメージへの切り戻し用 workflow がない
- 問題: 障害時に手で `gcloud run services update-traffic` を叩く必要がある
- 対応: `workflow_dispatch` + `inputs.image_sha` で **指定 SHA へロールバック** する workflow を作成

---

### 🟡 Medium

#### M-1. ワークフロー間の重複が多い

- `deploy-backend.yml` と `deploy-backend-staging.yml` の `test` ジョブ、`lint.yml` の frontend-lint / backend-lint がほぼコピペ
- 対応: `workflow_call`（reusable workflow）または composite action で共通化

#### M-2. `npm audit` が `continue-on-error: true`

- 該当: `security.yml:54,58`
- 現状: 脆弱性検出してもビルドが落ちない = 実質アラートとして機能していない
- 対応: 高危険度以上は `continue-on-error` を外すか、Slack 通知に結果を含める

#### M-3. Slack 通知が deploy ジョブ結果のみ参照

- 該当: `deploy-backend.yml:252`
- 現状: `needs: [migrate, deploy]` だが `status: ${{ needs.deploy.result }}` で deploy のみ
- 問題: **migrate が失敗しても deploy 結果が `skipped` として通知される**ため、失敗の視認性が低い
- 対応: 全ジョブの結果を集約するか、`job.status == 'failure'` 時の通知を別途送る

#### M-4. マイグレーションのドリフト検知がない

- 対応: `prisma migrate deploy` の前に `prisma migrate status` を実行してログに残す。想定外の差分があれば落ちる設定が安全。

#### M-5. `concurrency` 設定が未設定

- 現状: 連続 push で stg デプロイが並列実行され得る → Cloud Run への同時デプロイでレース発生の可能性
- 対応:
  ```yaml
  concurrency:
    group: deploy-backend-staging
    cancel-in-progress: false
  ```

#### M-6. frontend deploy に Test がない

- 該当: `deploy-frontend.yml:60-65`, `deploy-frontend-prod.yml:60-66`
- 現状: Lint とビルドのみ。Vitest の結果を見ずに Vercel にデプロイされている
- 対応: H-2 と合わせて解決

---

### 🟢 Low

#### L-1. `npm run test --passWithNoTests` のオプション渡し方

- `deploy-backend.yml:106`: `npm run test --passWithNoTests` → **npm 自身への引数**として解釈され jest に届かない可能性
- `test-backend.yml:73`: `npm run test:cov -- --passWithNoTests` → `--` 経由で正しく jest に届く
- 対応: 前者を `-- --passWithNoTests` に統一

#### L-2. Node.js バージョン指定の統一

- `lint.yml:19` は `node-version: 22`（数値）、他は `'22'`（文字列）
- 対応: `.nvmrc` を用意して全 workflow で `node-version-file: .nvmrc` に統一

#### L-3. Actions のバージョンが tag pin のみ

- `actions/checkout@v4` 等が tag 参照。supply chain 攻撃耐性を上げるなら SHA pin が望ましい

#### L-4. CodeQL が毎 PR で走る

- 重いので `paths` で絞るか schedule (週次) のみに変更すると PR のフィードバックが早くなる

---

## 3. 優先度付き対応表

| #        | 項目                            | 優先度    | 工数 | 備考                   |
| -------- | ------------------------------- | --------- | ---- | ---------------------- |
| C-1      | gcr.io → Artifact Registry 移行 | 🔥 最優先 | 中   | 動作未確認の可能性あり |
| H-1      | WIF 化                          | 🔥 最優先 | 中   | C-1 と同時実施が効率的 |
| C-3      | Playwright E2E の CI 組み込み   | 高        | 小   | 既存テスト資産の活用   |
| H-2      | Frontend Vitest を CI へ        | 高        | 小   |                        |
| C-2      | staging migration の承認ゲート  | 高        | 小   |                        |
| H-3      | stg デプロイ前 E2E              | 高        | 小   |                        |
| H-4      | ロールバック workflow           | 高        | 中   |                        |
| M-1      | reusable workflow 化            | 中        | 中   |                        |
| M-3      | Slack 通知の失敗可視性          | 中        | 小   |                        |
| M-5      | concurrency                     | 中        | 小   |                        |
| M-4      | migrate status でドリフト検知   | 中        | 小   |                        |
| M-2      | npm audit の閾値見直し          | 中        | 小   |                        |
| L-1〜L-4 | 細かい統一                      | 低        | 小   | まとめて対応可         |

---

## 4. 推奨ロードマップ

### Phase 1: 動作保証（今すぐ）

- C-1: gcr.io 動作確認 → Artifact Registry 移行
- H-1: WIF 化（C-1 と同時）

### Phase 2: 検証強化（1-2 週間）

- C-3: Playwright CI 組み込み
- H-2: Frontend Vitest
- C-2: stg migration 承認ゲート
- H-3: stg デプロイ前 E2E

### Phase 3: 運用強化（1 ヶ月）

- H-4: ロールバック workflow
- M-3, M-5, M-4: 通知・並列制御・ドリフト検知
- M-1: reusable workflow 化

### Phase 4: 整備（任意）

- L-1〜L-4 の細かい統一
