# リリース計画 — mosaku

作成日: 2026-03-02
対象: 少数の招待ユーザー（招待コード制）

---

## 環境定義

| 環境     | 用途           | BE                                 | FE                    | DB                             |
| -------- | -------------- | ---------------------------------- | --------------------- | ------------------------------ |
| **dev**  | ローカル開発   | localhost:3000                     | localhost:5173        | Supabase **stg** プロジェクト  |
| **stg**  | 動作確認・検証 | Cloud Run `mosaku-backend-staging` | Vercel **Preview**    | Supabase **stg** プロジェクト  |
| **prod** | 本番           | Cloud Run `mosaku-backend`         | Vercel **Production** | Supabase **prod** プロジェクト |

> **dev が stg DB を共有する理由**: 個人開発規模では DB を3つ用意するコストが高い。
> Supabase 無料枠は2プロジェクトのため、stg + prod で使い切る。

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

#### E-2: ローカル `.env` を Supabase stg に向ける

**`/Users/onotakashi/mosaku/.env`** と **`backend/.env`** の先頭2行を変更:

```
# Supabase stg
DATABASE_URL=postgresql://postgres.{stg_ref}:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.{stg_ref}:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

取得場所: Supabase Dashboard → stg プロジェクト → Settings → Database → Connection string

---

#### E-3: Prisma マイグレーション状態を確認（stg + prod）

E-2 完了後:

```bash
# stg に全マイグレーション適用
cd backend && npx prisma migrate deploy
```

prod Supabase でも同様に確認（接続文字列を一時的に prod に切り替えて実行）。

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

#### E-5: Cloud Run staging の環境変数を stg Supabase に向ける

Cloud Run `mosaku-backend-staging` サービスの環境変数を更新:

- `DATABASE_URL` → stg Supabase pooler URL
- `DIRECT_URL` → stg Supabase direct URL
- `CORS_ORIGINS` → stg フロントエンド URL（Vercel preview domain）

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

| #   | タスク                                         | 種別       | 規模   |
| --- | ---------------------------------------------- | ---------- | ------ |
| E-1 | Supabase stg プロジェクト作成                  | 環境構築   | 小     |
| E-2 | ローカル .env を stg Supabase に向ける         | 環境構築   | 小     |
| E-3 | Prisma マイグレーション確認（stg + prod）      | 環境構築   | 小     |
| E-4 | FE デプロイを stg 経由に修正                   | CI/CD 修正 | 小     |
| E-5 | Cloud Run staging の環境変数を stg DB に向ける | 環境構築   | 小     |
| B-1 | 自動保存の実装                                 | 機能開発   | 小〜中 |
| B-2 | ゴミ箱機能の実装                               | 機能開発   | 中     |
| —   | リリース前チェックリスト                       | QA         | —      |
| —   | 本番デプロイ                                   | デプロイ   | —      |

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
