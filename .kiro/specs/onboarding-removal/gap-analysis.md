# 実装ギャップ分析 - onboarding-removal

> 対象要件: `requirements.md`（generated / 未承認）
> 種別: 機能削除（3 層 + DB スキーマ）。新規実装・代替フローなし。

## 分析サマリ

- オンボーディングは **他モジュールから参照されない単方向依存の独立機能**。`OnboardingModule` が `Notebook/Memo/Prisma` を import するが逆参照はなく、切り離しは安全。
- **要件の削除列挙リストに漏れがある（最重要）**: `auth.controller.spec.ts` の `getMe` テスト 3 件（L604-646）が `onboardingCompleted` をモック・アサートしている。Req 5.4 は `backend/src/onboarding/*.spec.ts` のみを削除対象に挙げており、この auth 側テストが未カバー。カラム drop 後に型不整合・アサーション無効化を招く。
- **バックエンドの型は自動カスケードする**: `AuthenticatedUser = Omit<User, 'password'>`（`auth/types.ts`）。`getMe` は `findUserById` の戻り値をそのまま返すだけで明示 select なし。カラム drop + `prisma generate` で `onboardingCompleted` は自動消滅し、**手動の型編集は backend では不要**。
- **フロントの型名の食い違い**: 要件は「`utils/auth.ts` の `User` 型」と記すが、実体は `UserProfile` インターフェース（L11 に `onboardingCompleted`）。
- 工数 **S（1〜3日）** / リスク **Low**。ただし「DB drop → `prisma generate` → 型チェック」の順序遵守と auth テスト修正を外すと CI が赤化する。

## Requirement-to-Asset マップ

| 要件                  | 対象アセット                                                                                     | 状態          | 備考                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------- |
| R1 UI 除去            | `frontend/src/App.tsx` L22-23(import), L100-101(JSX)                                             | ✅特定済      | 編集 2 箇所                                                                                                     |
| R1                    | `frontend/src/components/onboarding/`（Gate/Modal/ThemeGallery + `ThemePreviewCard` + テスト群） | ✅特定済      | ディレクトリ丸ごと削除                                                                                          |
| R1.5 テーマ選択継続   | `ThemeGallery.tsx` が `useSystemThemes`（`useThemeQueries`）使用                                 | ✅Constraint  | 既存テーマ設定 UI 経由が成立する前提。**設定画面でテーマ選択が現存するか design で要確認**                      |
| R2 データ層           | `stores/useOnboardingStore.ts`(+test), `hooks/useOnboardingQueries.ts`(+test)                    | ✅特定済      | 削除                                                                                                            |
| R2.3 API              | `utils/api.ts` L583-591 `completeOnboarding`/`skipOnboarding`(+`api.test.ts` L688-738)           | ✅特定済      | **`api.test.ts` の該当テストも削除対象（要件未明記）**                                                          |
| R2.4 型               | `utils/auth.ts` L11 `onboardingCompleted`（型名は `UserProfile`）                                | ⚠️Missing     | 要件の「User 型」は名称誤り。実体は `UserProfile`                                                               |
| R3 BE モジュール      | `backend/src/onboarding/`（controller/service/dto/module/spec×2）                                | ✅特定済      | 削除                                                                                                            |
| R3.2/3.3 登録解除     | `app.module.ts` L12(import), L46(imports 配列)                                                   | ✅特定済      | 編集                                                                                                            |
| R4 スキーマ           | `schema.prisma` L159 `onboardingCompleted`                                                       | ✅特定済      | フィールド削除                                                                                                  |
| R4.2/4.3 migration    | `prisma/migrations/` に新規 forward migration                                                    | ✅特定済      | `DROP COLUMN onboarding_completed`。既存 `20260608230032_add_onboarding_completed` は履歴として保持（編集禁止） |
| R5.1 保護             | `config/config.service.ts` `onboarding@resend.dev`                                               | ✅Constraint  | 触らない                                                                                                        |
| R5.3/5.4 テスト健全性 | **`auth/auth.controller.spec.ts` L604-646（getMe×3）**                                           | 🔴**Missing** | **要件の削除列挙から漏れ。`onboardingCompleted` のモック値除去＋アサート 2 件の削除/修正が必須**                |
| R5.5 lint             | `useOnboardingQueries.ts` の `setTag('feature_area','onboarding')`                               | ℹ️Note        | `'onboarding'` は Sentry `feature_area` enum 契約外（tech.md）。削除で自然解消                                  |

凡例: ✅特定済 / ⚠️要件の記述ズレ / 🔴削除スコープ漏れ / ℹ️補足

## 実装アプローチ

削除タスクのため A/B/C は「除去戦略」として再解釈する。

### Option A: 単一パス完全削除（推奨）

3 層 + DB + 取りこぼしテスト（auth spec / api.test）を 1 スペックで一括除去。

- ✅ 中途半端な型不整合状態を残さない / dead code ゼロを一度に達成
- ✅ パターンは「ファイル削除＋参照除去」のみで認知負荷が低い
- ❌ DB drop と型チェックの順序を 1 PR 内で正しく組む必要（`prisma generate` を型チェック前に）

### Option B: 段階削除（FE 先行 → BE/DB 後追い、or 逆）

- ✅ PR を小さく分割でき個別レビューが容易
- ❌ 中間状態で型・契約の不整合ウィンドウが生まれる（例: FE 型から外したが BE は返し続ける）。本機能は規模が小さく分割の利得が薄い

### Option C: カラム温存（コードのみ除去、DB は据え置き）

- ✅ 本番 migration（`prisma migrate deploy`）不要でデプロイリスク回避
- ❌ **Req 4（カラム削除）を満たさない**。dead column と「スキーマ正規化」目的に反する。非推奨

## 工数・リスク

- **工数: S（1〜3日）** — 既存パターン（モジュール削除・参照除去）のみ。新規実装ゼロ。
- **リスク: Low**（ただし以下 2 点を外すと Medium 化）
  1. **auth テストの取りこぼし**: `auth.controller.spec.ts` を直さないと R5.3（テスト緑）に違反。
  2. **順序依存**: カラム drop 後に `npx prisma generate` を実行しないと `AuthenticatedUser` 型が更新されず型チェックが旧フィールドを参照したまま。pre-push フックが `prisma generate → 型チェック` を回す設計（CLAUDE.md）なのでローカルでは検知可だが、design でデプロイ順序を明記すべき。

## design フェーズへの引き継ぎ

**推奨アプローチ**: Option A（単一パス完全削除）。

**設計で確定すべき決定事項**:

1. **削除スコープの正式拡張** — `requirements.md` の列挙に `auth/auth.controller.spec.ts`（getMe テストの `onboardingCompleted` 除去）と `utils/api.test.ts`（onboarding テスト削除）を追加。R2.4 の「User 型」を `UserProfile` に訂正。
2. **migration 戦略** — 新規 forward migration で `DROP COLUMN`。データ損失（boolean フラグ）は意図的で許容。本番は `prisma migrate deploy`（R4.4）。ロールバックは「再 add migration」で対応可と明記。
3. **作業順序** — ①コード参照除去 → ②schema からフィールド削除 → ③`prisma generate` → ④型チェック/テスト の順を design に固定。

**Research Needed**:

- R1.5 の前提検証: 設定画面（`components/settings/`）に既存テーマ選択 UI が実在し、オンボーディング削除後もユーザーがテーマを選べるか（design で実コード確認）。

## 次のステップ

- 上記の削除スコープ補正を反映するなら、先に `requirements.md` を更新して再承認。
- そのまま進める場合: `/kiro:spec-design onboarding-removal`（design 内でスコープ補正を吸収）。
