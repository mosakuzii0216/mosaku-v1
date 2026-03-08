# リリース計画 — mosaku

作成日: 2026-03-02
対象: 少数の招待ユーザー（招待コード制）

---

## 環境定義

| 環境     | 用途           | BE                                 | FE                    | DB                             |
| -------- | -------------- | ---------------------------------- | --------------------- | ------------------------------ |
| **dev**  | ローカル開発   | localhost:3000                     | localhost:5173        | **Docker** ローカル PostgreSQL |
| **stg**  | 動作確認・検証 | Cloud Run `mosaku-backend-staging` | Vercel **Preview**    | Supabase **stg** プロジェクト  |
| **prod** | 本番           | Cloud Run `mosaku-backend`         | Vercel **Production** | Supabase **prod** プロジェクト |

> **dev は Docker ローカル DB を使用**: 開発環境を完全に独立させ、stg/prod DB への誤操作を防ぐ。
> Supabase 無料枠（2プロジェクト）は stg + prod で使い切る。

---

## デプロイフロー

```
feature/xxx ブランチ
  └─ PR 作成
       ├─ GitHub Actions: lint / test / build (自動)
       └─ Vercel: Preview URL 発行 (自動)
             ↓ レビュー・確認
           main へマージ
               ├─ BE: Cloud Run staging へ自動デプロイ
               └─ FE: Vercel Preview → stg URL として確認
                         ↓ stg で動作確認OK
                       本番リリース（手動）
                           ├─ BE: GitHub Actions → deploy-backend.yml → 手動実行
                           └─ FE: GitHub Actions → deploy-frontend-prod.yml → 手動実行
```

### ブランチ戦略

| ブランチ    | デプロイ先                  | トリガー            |
| ----------- | --------------------------- | ------------------- |
| `feature/*` | Vercel Preview のみ         | PR 作成時 自動      |
| `main`      | BE: stg、FE: Vercel Preview | push 時 自動        |
| 手動実行    | BE + FE: prod               | GitHub Actions 手動 |

---

## 現状のインフラ資産

### 構築済み ✅

| 層      | サービス                           | 状態                                                       |
| ------- | ---------------------------------- | ---------------------------------------------------------- |
| BE stg  | Cloud Run `mosaku-backend-staging` | ✅ ワークフロー済み（main push で自動）                    |
| BE prod | Cloud Run `mosaku-backend`         | ✅ ワークフロー済み（手動）                                |
| FE      | Vercel                             | ✅ ワークフロー済み（main push で **prod 直行** ← 要修正） |
| DB prod | Supabase `ninyjmahwnbtgqqjxcli`    | ✅ 稼働中                                                  |
| CI      | GitHub Actions lint / test         | ✅ 設定済み                                                |

### 未構築 ❌

| 層        | 必要なもの                                                        |
| --------- | ----------------------------------------------------------------- |
| DB stg    | Supabase stg プロジェクト（新規作成）                             |
| FE stg    | Vercel の main → prod 直行を修正（Preview または stg 専用フロー） |
| local dev | `.env` を Supabase stg に向ける                                   |

---

## 作業リスト

### フェーズ0: 環境構築

#### E-1: Supabase stg プロジェクトを作成する

1. [Supabase Dashboard](https://app.supabase.com) → New project
2. プロジェクト名: `mosaku-stg`
3. リージョン: Tokyo（ap-northeast-1）
4. `prisma migrate deploy` で全マイグレーションを適用
5. テーマシードデータを投入（既存 SQL を実行）

> ⚠️ 無料枠は2プロジェクトまで。prod と stg で使い切る。

---

#### E-2: ローカル `.env` を Docker ローカル DB に向ける

**`backend/.env`** の DB 接続先を Docker ローカル PostgreSQL に変更:

```
# Docker ローカル DB
DATABASE_URL=postgresql://mosakuzii:mosakuzii@localhost:5432/mosaku?schema=public
DIRECT_URL=postgresql://mosakuzii:mosakuzii@localhost:5432/mosaku
```

> docker-compose.yml の `backend` サービスは Docker 内では `db:5432` を自動参照する。
> `backend/.env` はホストから `npm run dev` で起動する場合に使用される。

---

#### E-3: ローカル DB の初期化とマイグレーション確認（stg + prod）

**ローカル DB の初期化:**

```bash
# Docker ローカル DB を起動
docker-compose --profile local up db -d

# ローカル DB にマイグレーション適用
cd backend && npx prisma migrate dev
```

**stg / prod の確認（接続文字列を一時的に切り替えて実行）:**

```bash
# stg に全マイグレーション適用
DATABASE_URL={stg_url} npx prisma migrate deploy
```

> `20260224000000_add_kami_code_themes` が pending で出ても `ON CONFLICT DO NOTHING` で安全に適用可能。

---

#### E-4: FE デプロイを stg 経由に修正

**現状の問題**: `deploy-frontend.yml` が main push → Vercel **Production** に直行している。

**対応**: `deploy-frontend.yml` を main push では **Preview デプロイ**のみに変更し、
本番昇格用の `deploy-frontend-prod.yml`（手動トリガー）を別途作成する。

```
現状: main push → Vercel Production（prod）
修正後:
  main push      → Vercel Preview（stg 相当）
  手動実行       → Vercel Production（prod）
```

---

#### E-5: Staging 環境を完全構築する

**確定したドメイン** (`mosaku.jp` 取得済み):

- フロントエンド: `stg.mosaku.jp`（Vercel Preview）
- バックエンド: `api-stg.mosaku.jp`（Cloud Run `mosaku-backend-staging`）

**E-5-2: Secret Manager に stg 用シークレット登録**

```bash
# stg Supabase の接続文字列を登録（{STAGING_REF}, {STAGING_PASSWORD} を置換）
echo -n "postgresql://postgres.{STAGING_REF}:{STAGING_PASSWORD}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true" | \
  gcloud secrets create database-url-staging --project=igneous-core-480923-j0 --data-file=-

echo -n "postgresql://postgres.{STAGING_REF}:{STAGING_PASSWORD}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" | \
  gcloud secrets create direct-url-staging --project=igneous-core-480923-j0 --data-file=-

echo -n "{STAGING_ANON_KEY}" | \
  gcloud secrets create supabase-anon-key-staging --project=igneous-core-480923-j0 --data-file=-
```

**E-5-3: Cloud Run `mosaku-backend-staging` 初回デプロイ**

```bash
gcloud run deploy mosaku-backend-staging \
  --project=igneous-core-480923-j0 \
  --image=gcr.io/igneous-core-480923-j0/mosaku-backend:latest \
  --region=asia-northeast1 \
  --allow-unauthenticated \
  --port=8080 --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=5 \
  --set-env-vars="NODE_ENV=staging,FRONTEND_URL=https://stg.mosaku.jp,CORS_ORIGINS=https://stg.mosaku.jp,SUPABASE_URL=https://{STAGING_REF}.supabase.co,ADMIN_EMAIL=mosakuzii1928@gmail.com,GOOGLE_CLIENT_ID=...,GOOGLE_REDIRECT_URI=https://api-stg.mosaku.jp/auth/google/callback,GITHUB_CLIENT_ID=...,GITHUB_REDIRECT_URI=https://api-stg.mosaku.jp/auth/github/callback" \
  --update-secrets="DATABASE_URL=database-url-staging:latest,DIRECT_URL=direct-url-staging:latest,SUPABASE_ANON_KEY=supabase-anon-key-staging:latest,JWT_SECRET=jwt-secret:latest,SESSION_SECRET=session-secret:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,GITHUB_CLIENT_SECRET=github-client-secret:latest"
```

**E-5-4: Prisma マイグレーション（stg DB）**

```bash
cd backend
DIRECT_URL=$(gcloud secrets versions access latest --secret=direct-url-staging --project=igneous-core-480923-j0) \
DATABASE_URL=$(gcloud secrets versions access latest --secret=database-url-staging --project=igneous-core-480923-j0) \
npx prisma migrate deploy
```

**E-5-5〜7: Vercel / DNS / OAuth 設定**

- Vercel Dashboard → Domains → `stg.mosaku.jp` 追加
- DNS: `CNAME stg → Vercel指定値`、`CNAME api-stg → ghs.googlehosted.com`
- Cloud Run ドメインマッピング: `gcloud run domain-mappings create --service=mosaku-backend-staging --domain=api-stg.mosaku.jp`
- Google OAuth: 承認済みオリジンに `https://stg.mosaku.jp`、コールバックに `https://api-stg.mosaku.jp/auth/google/callback` 追加
- GitHub OAuth: コールバックに `https://api-stg.mosaku.jp/auth/github/callback` 追加

> 詳細コマンドは `docs/private/staging-setup-progress.md` を参照。

---

### フェーズ1: リリース必須機能

#### B-1: 自動保存の実装

**理由**: 保存忘れ・ブラウザ誤閉じによるデータ消失防止。リリース前必須。

**実装イメージ**:

```
MemoEditor に useDebounce（1〜2秒）を追加
→ 変更後に自動で updateMemo.mutate() を呼ぶ
→ 「自動保存しました」の一瞬フィードバック表示
→ 新規作成時はタイトルまたは本文が入力済みの場合のみ発動
```

**作業量**: 小〜中（フロントエンドのみ、スキーマ変更なし）
**着手**: `/add-feature 自動保存`

---

#### B-2: ゴミ箱機能の実装

**理由**: 誤削除への安心感はユーザー信頼に直結。リリース前必須。

**実装イメージ**:

```
バックエンド:
  Memo に deletedAt: DateTime? を追加（Prisma マイグレーション必要）
  DELETE → soft delete（deletedAt = now()）
  GET /memos に WHERE deletedAt IS NULL フィルター追加
  GET /trash・POST /trash/:id/restore・DELETE /trash/:id（完全削除）

フロントエンド:
  ゴミ箱ビュー（削除済みメモ一覧）
  復元・完全削除ボタン
  サイドバーに「ゴミ箱」リンク追加
```

**作業量**: 中（BE + FE + Prisma マイグレーション）
**着手**: `/add-feature ゴミ箱機能`

---

### フェーズ2: リリース準備

#### リリース前チェックリスト

**コード品質**

- [ ] `npm run lint`（frontend / backend）エラーなし
- [ ] `npm run test`（backend）パス
- [ ] `npm run build`（frontend / backend）パス

**stg での動作確認**

- [ ] 招待コードで新規ユーザー登録できる
- [ ] Google / GitHub OAuth でログインできる
- [ ] メモの作成・編集・削除が動作する
- [ ] 自動保存が機能する（編集後 1〜2秒で「保存済み」表示）
- [ ] 削除したメモがゴミ箱に移動する
- [ ] ゴミ箱から復元・完全削除できる
- [ ] ノートブック・タグの操作が正常
- [ ] テーマ切り替え（kami, code を含む）が動作する
- [ ] 既存テーマ（ao, aka, mori, kuro, siro）が壊れていない

**DB**

- [ ] stg / prod 両方で pending マイグレーションがない

---

### フェーズ3: 本番デプロイ

```
1. prod DB マイグレーション
   cd backend && DATABASE_URL={prod} npx prisma migrate deploy

2. BE デプロイ
   GitHub Actions → deploy-backend.yml → Run workflow（手動）
   ※ production environment の承認ゲートあり

3. FE デプロイ
   GitHub Actions → deploy-frontend-prod.yml → Run workflow（手動）
```

---

### フェーズ4: リリース後

```
1. 招待コード発行
   管理者アカウントでログイン → /admin/invitations → コード作成 → 共有

2. モニタリング
   - Cloud Run ログ: Google Cloud Console → Cloud Logging
   - Vercel ログ: Vercel Dashboard → Deployments
```

---

## 全作業サマリー

| #   | タスク                                            | 種別       | 規模   |
| --- | ------------------------------------------------- | ---------- | ------ |
| E-1 | Supabase stg プロジェクト作成                     | 環境構築   | 小     |
| E-2 | ローカル .env を Docker ローカル DB に向ける      | 環境構築   | 小     |
| E-3 | ローカル DB 初期化・stg/prod マイグレーション確認 | 環境構築   | 小     |
| E-4 | FE デプロイを stg 経由に修正                      | CI/CD 修正 | 小     |
| E-5 | Cloud Run staging の環境変数を stg DB に向ける    | 環境構築   | 小     |
| B-1 | 自動保存の実装                                    | 機能開発   | 小〜中 |
| B-2 | ゴミ箱機能の実装                                  | 機能開発   | 中     |
| —   | リリース前チェックリスト                          | QA         | —      |
| —   | 本番デプロイ                                      | デプロイ   | —      |

**推奨順序**: E-1 → E-2 → E-3 → E-4 → E-5 → B-1 → B-2 → チェックリスト → デプロイ

---

## 将来のロードマップ（リリース後）

| 優先度 | 機能                  | 難易度 |
| ------ | --------------------- | ------ |
| A      | メモのピン留め        | 低     |
| A      | 横断検索強化          | 中     |
| A      | Markdown エクスポート | 低     |
| A      | ダッシュボード        | 低     |
| A      | キーボードナビ強化    | 低     |
| A      | ダークモード切り替え  | 低     |
| B      | 並び順カスタマイズ    | 中     |
| B      | テンプレート機能      | 中     |
| B      | メモ間リンク          | 高     |
| B      | ノートブック共有      | 高     |
