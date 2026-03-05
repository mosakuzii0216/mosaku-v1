# リリース計画 進捗管理

作成日: 2026-03-03

---

## フェーズ0: 環境構築

| #   | タスク                                            | 状態        | 備考                                                |
| --- | ------------------------------------------------- | ----------- | --------------------------------------------------- |
| E-1 | Supabase stg プロジェクト作成                     | ✅ 完了     | 手動作業（Supabase Dashboard）                      |
| E-2 | ローカル `.env` を Docker ローカル DB に向ける    | ✅ 完了     | 既に設定済み                                        |
| E-3 | ローカル DB 初期化・stg/prod マイグレーション確認 | 🔶 一部完了 | ローカル: 21 migrations 適用済み。stg/prod は未確認 |
| E-4 | FE デプロイを stg 経由に修正                      | ✅ 完了     | 2026-03-03                                          |
| E-5 | Cloud Run staging の環境変数を stg DB に向ける    | ⬜ 未着手   | E-1 完了後（Cloud Run コンソール手動操作）          |

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

## 次のステップ

**手動作業が必要なもの（あなたが実施）:**

1. ~~**E-1**: Supabase Dashboard で `mosaku-stg` プロジェクト作成~~ ✅ 完了
2. ~~**E-2**: `backend/.env` を Docker ローカル DB に向ける~~ ✅ 完了
3. **E-5**: Cloud Run `mosaku-backend-staging` の環境変数を stg DB に更新（Cloud Run コンソール）
4. **E-3（残り）**: stg/prod の pending マイグレーション確認

**機能開発（E-3/E-5 完了後）:**

5. **B-1**: `/add-feature 自動保存` で着手
6. **B-2**: `/add-feature ゴミ箱機能` で着手
