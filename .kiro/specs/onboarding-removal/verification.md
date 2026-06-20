# 本番デプロイ検証（2026-06-20）

## 結論

onboarding 削除はソース・本番ともに**完了済み**。残存して見える事象は削除作業の漏れではなく、PWA Service Worker のキャッシュ残りが原因。

## ソース

- backend モジュール・frontend UI/API クライアント・DB カラム `onboardingCompleted` の drop migration まで `main` にマージ・push 済み。
- `HEAD = origin/main = dc54b5c`（未 push なし）。
- drop migration: `backend/prisma/migrations/20260618000000_remove_onboarding_completed/migration.sql`（`ALTER TABLE "User" DROP COLUMN "onboardingCompleted";`）。

## 本番確認（api.mosaku.jp / 2026-06-20）

| リクエスト                  | 結果 | 意味                                                   |
| --------------------------- | ---- | ------------------------------------------------------ |
| `POST /onboarding/complete` | 404  | ルート削除済み（残存なら JWT Guard で 401 になるはず） |
| `POST /onboarding/skip`     | 404  | 同上                                                   |
| `GET /auth/google`          | 302  | サーバー稼働中のベースライン                           |

→ onboarding モジュールは本番からも削除デプロイ済み。

## 「本番でまだ onboarding が出る」の真因

PWA Service Worker の `registerType: 'prompt'` 方式（`frontend/src/utils/pwa/pwa-config.ts`）により、ユーザーが更新トースト（`SwUpdatePrompt`）を押すまで削除前バンドルが waiting のまま居座るため。サーバー側 API は 404 でも、キャッシュされた古い UI だけが表示され続ける。

→ 構造的対策として SW 更新の `registerType: 'autoUpdate'` 化を別途進める方針（spec `pwa-sw-auto-update` を次段で起票予定）。
