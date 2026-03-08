# リリース計画 進捗管理

作成日: 2026-03-03

---

## フェーズ0: 環境構築

| #   | タスク                                            | 状態      | 備考                                                                               |
| --- | ------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| E-1 | Supabase stg プロジェクト作成                     | ✅ 完了   | 手動作業（Supabase Dashboard）                                                     |
| E-2 | ローカル `.env` を Docker ローカル DB に向ける    | ✅ 完了   | 既に設定済み                                                                       |
| E-3 | ローカル DB 初期化・stg/prod マイグレーション確認 | ✅ 完了   | ローカル/stg/prod すべて 21 migrations 適用済み                                    |
| E-4 | FE デプロイを stg 経由に修正                      | ✅ 完了   | 2026-03-03                                                                         |
| E-5 | Cloud Run staging の環境変数を stg DB に向ける    | 🔄 進行中 | 詳細は下記サブタスク参照。ドメイン: `stg.mosaku.jp` / `api-stg.mosaku.jp` 確定済み |

---

## フェーズ1: リリース必須機能

| #   | タスク           | 状態      | 備考                      |
| --- | ---------------- | --------- | ------------------------- |
| B-1 | 自動保存の実装   | ⬜ 未着手 | `/add-feature 自動保存`   |
| B-2 | ゴミ箱機能の実装 | ⬜ 未着手 | `/add-feature ゴミ箱機能` |

---

## フェーズ2: リリース準備

| チェック項目                                    | 状態      |
| ----------------------------------------------- | --------- |
| `npm run lint`（frontend / backend）エラーなし  | ⬜ 未確認 |
| `npm run test`（backend）パス                   | ⬜ 未確認 |
| `npm run build`（frontend / backend）パス       | ⬜ 未確認 |
| stg で招待コード登録・OAuth ログイン動作確認    | ⬜ 未確認 |
| stg でメモの作成・編集・削除動作確認            | ⬜ 未確認 |
| stg で自動保存動作確認                          | ⬜ 未確認 |
| stg でゴミ箱・復元・完全削除動作確認            | ⬜ 未確認 |
| stg でテーマ切り替え（kami, code 含む）動作確認 | ⬜ 未確認 |
| stg / prod 両方で pending マイグレーションなし  | ⬜ 未確認 |

---

## フェーズ3: 本番デプロイ

| ステップ                                         | 状態      |
| ------------------------------------------------ | --------- |
| prod DB マイグレーション実行                     | ⬜ 未実施 |
| BE デプロイ（deploy-backend.yml 手動実行）       | ⬜ 未実施 |
| FE デプロイ（deploy-frontend-prod.yml 手動実行） | ⬜ 未実施 |

---

## E-4 作業ログ（2026-03-03 完了）

**変更内容:**

- `.github/workflows/deploy-frontend.yml` を修正
  - `vercel pull --environment=production` → `--environment=preview`
  - `vercel build --prod` → `vercel build`（--prod 削除）
  - `vercel deploy --prebuilt --prod` → `--prod` 削除（Preview デプロイ）
  - ワークフロー名を `Deploy Frontend to Vercel (Staging/Preview)` に変更
  - Job 名を `Deploy to Vercel (Preview/Staging)` に変更

- `.github/workflows/deploy-frontend-prod.yml` を新規作成
  - トリガー: `workflow_dispatch` のみ
  - `environment: production` でGitHub承認ゲート設定
  - `--prod` フラグで Vercel Production デプロイ

**デプロイフロー（修正後）:**

```
main push → deploy-frontend.yml → Vercel Preview（stg 相当）
手動実行  → deploy-frontend-prod.yml → Vercel Production（prod）
```

---

## E-5 サブタスク（2026-03-08 詳細化）

ドメイン確定: `mosaku.jp` 取得済み、stg は `stg.mosaku.jp` / `api-stg.mosaku.jp`

| #     | 作業                                                           | 場所                  | 状態                      |
| ----- | -------------------------------------------------------------- | --------------------- | ------------------------- |
| E-5-1 | Supabase stg の Project Ref・パスワードを確認                  | Supabase Dashboard    | ✅ 完了（E-1 で取得済み） |
| E-5-2 | Secret Manager に stg 用シークレット登録                       | gcloud CLI            | ⬜ 未着手                 |
| E-5-3 | Cloud Run `mosaku-backend-staging` 初回デプロイ（stg DB 向け） | gcloud CLI            | ⬜ 未着手                 |
| E-5-4 | Prisma マイグレーション（stg DB）                              | ローカル CLI          | ⬜ 未着手                 |
| E-5-5 | Vercel に `stg.mosaku.jp` ドメイン割り当て                     | Vercel Dashboard      | ⬜ 未着手                 |
| E-5-6 | DNS 設定（stg / api-stg サブドメイン追加）                     | DNS 管理画面          | ⬜ 未着手                 |
| E-5-7 | OAuth 設定更新（Google / GitHub に stg URL 追加）              | Google Cloud / GitHub | ⬜ 未着手                 |
| E-5-8 | 動作確認（`stg.mosaku.jp` でログイン・メモ操作）               | ブラウザ              | ⬜ 未着手                 |

> 詳細コマンドは `docs/private/staging-setup-progress.md` を参照。

---

## 次のステップ

**手動作業が必要なもの（E-5 完了まで）:**

1. ~~**E-1**: Supabase Dashboard で `mosaku-stg` プロジェクト作成~~ ✅ 完了
2. ~~**E-2**: `backend/.env` を Docker ローカル DB に向ける~~ ✅ 完了
3. **E-5-2**: `gcloud secrets create database-url-staging ...` で Secret Manager に stg シークレット登録
4. **E-5-3**: `gcloud run deploy mosaku-backend-staging ...` で Cloud Run stg サービス初回デプロイ
5. **E-5-4**: `npx prisma migrate deploy`（DIRECT_URL を stg に向けて実行）
6. **E-5-5〜7**: Vercel / DNS / OAuth 設定
7. **E-5-8**: `stg.mosaku.jp` で動作確認

**機能開発（E-5 完了後）:**

8. **B-1**: `/add-feature 自動保存` で着手
9. **B-2**: `/add-feature ゴミ箱機能` で着手
