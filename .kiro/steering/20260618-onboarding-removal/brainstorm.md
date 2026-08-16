# ブレインストーミング - 2026-06-18

## セッションの文脈

- 出発点となった課題感（ユーザーの言葉）:
  - 「オンボーディングの表示が毎回出て邪魔」
  - 「そもそも早すぎた感があるから、オンボーディング機能をやっぱり削除したい」
- 議論の流れ: 不便の起点 → 削除の影響範囲を実コード調査 → DB カラムの扱いを判断 → 削除方針確定

## 重要な発見

1. **「毎回出る」の真因**: `OnboardingGate.tsx` は `if (user && !user.onboardingCompleted) open()`。完了時に `onboardingCompleted=true` を **DB には書く**が、`AuthContext` の `user` オブジェクトへ反映する処理が見当たらない → 毎回 `false` のままモーダルが開いていた可能性が高い。（※削除するので修正は不要）
2. **オンボーディングは他モジュールから参照されておらず、独立して切り離せる**。エンドポイントは `POST /onboarding/complete` `/onboarding/skip` の 2 つのみ。

## 削除の影響範囲

### バックエンド（NestJS）

| 対象                                         | 操作   | 内容                                               |
| -------------------------------------------- | ------ | -------------------------------------------------- |
| `backend/src/onboarding/` 丸ごと             | 🗑️削除 | controller / service / dto / spec                  |
| `backend/src/app.module.ts` (L12, L46)       | ✏️編集 | `OnboardingModule` の import と登録を除去          |
| `schema.prisma` `onboardingCompleted` (L159) | 🗑️drop | migration を作成してカラム削除（本番 deploy 必要） |

- ⚠️ `config/config.service.ts` の `onboarding@resend.dev` はメール送信元のデフォルト値で **無関係**。触らない。

### フロントエンド（React）

| 対象                                                    | 操作   | 内容                                         |
| ------------------------------------------------------- | ------ | -------------------------------------------- |
| `components/onboarding/`（Gate / Modal / ThemeGallery） | 🗑️削除 |                                              |
| `stores/useOnboardingStore.ts`                          | 🗑️削除 |                                              |
| `hooks/useOnboardingQueries.ts`                         | 🗑️削除 |                                              |
| `App.tsx` (L22-23, L100-101)                            | ✏️編集 | import 2 行＋JSX 2 行を除去                  |
| `utils/api.ts` (L583-591)                               | ✏️編集 | `completeOnboarding` / `skipOnboarding` 削除 |
| `utils/auth.ts` (L11)                                   | ✏️編集 | `User` 型の `onboardingCompleted` 削除       |

### テスト

- `backend/src/onboarding/*.spec.ts`（モジュールごと削除）
- フロント側の onboarding 関連テストがあれば併せて削除

## 決定事項

- **オンボーディング機能を全削除する**
- **DB カラム `onboardingCompleted` は migration で drop**（コードからの参照も全除去）

## 実施メモ

- 選択した機能: オンボーディング削除（onboarding-removal）
- 次のステップ: cc-sdd に則り `/kiro:spec-init` で起票 → requirements/design/tasks 承認 → 実装
