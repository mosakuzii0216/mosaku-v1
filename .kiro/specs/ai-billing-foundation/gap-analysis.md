# Gap Analysis — ai-billing-foundation

> 承認済み要件（`requirements.md`）と既存コードベースのギャップ分析。設計フェーズの意思決定材料として提供する。
> **本書は情報提供であり、最終的な実装選択ではない。** 複数の選択肢とトレードオフを提示する。

## 0. 現状サマリ

- **課金関連の既存コードはゼロ**。`Purchase` / `AiUsage` モデル、Stripe 連携、課金カラム、AI 依存（`stripe` / `@anthropic-ai` / `@ai-sdk`）はいずれも未導入。`monetization.md` 冒頭の「ステータス: 計画（未実装）」と一致。
- **基盤の足回りは揃っている**。グローバル JWT Guard + `@Public()`、`AppException`（構造化エラー）、`$transaction`（複数サービスで実績あり）、ドメインモジュールの定型（`notebook/` がテンプレ）、フロントの `use{Domain}Queries.ts` + `apiClient` + `queryKeys`。
- **本 spec は「新規ドメインモジュール追加（Option B 主体）」が自然**。既存パターンに素直に乗る一方、Stripe webhook の raw body・冪等性・残高減算の同時実行制御という外部統合特有の難所がある。
- **要件記載とコードの不整合を1件検出**: `AuthorizationService` の実メソッドは `checkOwnership` ではなく **`validateOwnership`**（後述、要件 9.2 / CLAUDE.md の文言と差異）。
- **要件に明示されていない致命的論点が2件**: Stripe webhook の**冪等性**と、残高減算の**同時実行レース**。どちらも「請求漏れ／二重計上」に直結するため設計で必ず詰める。

---

## 1. 既存資産の調査結果（Current State）

### バックエンド構成・規約

| 観点                   | 実態                                                                                                                                                   | 出典                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| ドメインモジュール定型 | `{domain}.module.ts` / `.controller.ts` / `.service.ts` / `dto/` + `*.spec.ts`。`notebook/` が完全なテンプレ                                           | `backend/src/notebook/`                                           |
| 所有権チェック         | `AuthorizationService.validateOwnership(entity, userId, name)` / `validateBulkOwnership` / `validateExistence`。**`checkOwnership` は存在しない**      | `common/services/authorization*.ts`                               |
| 認証                   | グローバル JWT Guard + `@Public()`（`SetMetadata('isPublic', true)`）でオプトアウト                                                                    | `auth/jwt-auth.guard.ts`, `common/decorators/public.decorator.ts` |
| 構造化エラー           | `AppException(code, statusCode, message?, details?)`。レスポンスは `{ code, message, statusCode, details? }`。`throwBadRequest/Forbidden/...` ヘルパー | `common/exceptions/app.exception.ts`                              |
| エラーコード体系       | `ERROR_CODES`（AUTH/AUTHZ/RES/VAL/INV）。**BILLING 系は未定義**                                                                                        | `common/exceptions/error-codes.ts`                                |
| トランザクション       | `prisma.$transaction` を refresh-token / invitation / onboarding で使用済み                                                                            | `grep '$transaction'`                                             |
| 環境変数               | `ConfigService` の getter で `process.env.X` を遅延参照し、未設定時は throw or warn                                                                    | `config/config.service.ts`                                        |
| 起動                   | `NestFactory.create(AppModule)`（**`rawBody: true` 指定なし**）、helmet、グローバル pipe/filter                                                        | `main.ts`                                                         |
| スケジュール           | `@nestjs/schedule` 採用済み（trash-cleanup の cron 実績）                                                                                              | `tech.md`                                                         |

### フロントエンド構成・規約

| 観点         | 実態                                                                                      | 出典                        |
| ------------ | ----------------------------------------------------------------------------------------- | --------------------------- |
| サーバー状態 | `hooks/use{Domain}Queries.ts` に React Query を集約。Zustand へコピー禁止                 | `structure.md`              |
| API コール   | `apiClient`（`utils/api.ts`）経由。`authLevel: REQUIRED/OPTIONAL/NONE`。直接 `fetch` 禁止 | `frontend/src/utils/api.ts` |
| エラー型     | `ApiError`（`utils/apiError.ts`）でバックエンドの構造化エラーを表現                       | `utils/api.ts` import       |
| クエリキー   | `queryKeys` 定数で一元管理（`billing`/`wallet`/`usage` は未定義）                         | `constants/queryKeys.ts`    |

### Prisma スキーマ現状

- `User` に課金カラム（`stripeCustomerId` / `subscriptionStatus` / `walletBalanceYen` 等）は**未追加**。
- `Notebook` に `notebookId` 参照は存在するが `characterLimit`/`isFree`/`purchaseId` は**未追加**（要件どおりスコープ外）。
- `AiUsage` / `Purchase` モデル・関連 enum は**未定義**。
- enum 定義は schema 末尾に集約する慣習（`UserRole` / `RefreshTokenStatus` / `FeedbackCategory`）。命名は PascalCase、`@@map` で snake_case テーブル名。

---

## 2. Requirement-to-Asset Map（要件 ↔ 資産・ギャップ）

タグ: **Missing**（新規実装）/ **Unknown**（要研究）/ **Constraint**（既存制約に従う）/ **Reuse**（既存流用）

| 要件                              | 必要な技術要素                                                                      | 既存資産                                         | ギャップ                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **R1 課金ゲート**                 | 残高・天井ガード → 実行可否判定を全 AI パスが通る共通サービス                       | サービス層パターン、`$transaction`               | **Missing**（`BillingGateService`）。「全パス経由保証」の強制手段は **Unknown**（規約 or デコレータ or 単一エントリ） |
| **R2 計上×減算の整合**            | `AiUsage` 記録と `walletBalanceYen` 減算を単一 Tx                                   | `prisma.$transaction` 実績                       | **Reuse**（Tx）＋**Constraint**（同時実行レース対策＝条件付き更新／行ロックが必須）                                   |
| **R3 データモデル**               | `User` 拡張 + `AiUsage` + `Purchase` + enum + migration                             | Prisma 慣習、`npx prisma migrate dev`            | **Missing**（スキーマ全体）。`tokensUsed`/`costYen` の型（Int 円・小数なし）は要確定                                  |
| **R4 サブスク + webhook**         | Stripe Subscription 作成、`invoice.paid` で ¥500 付与、cancel/expire 反映、署名検証 | `@Public()`、ConfigService                       | **Missing**（`stripe` SDK 導入）＋**Constraint**（webhook は raw body 必須／`main.ts` 要変更）＋**Unknown**（冪等性） |
| **R5 追加チャージ**               | Payment Intent 作成、`Purchase` PENDING→COMPLETED、天井超過ブロック                 | 同上                                             | **Missing**＋**Unknown**（自動 or 手動チャージの既定挙動は `monetization.md` 未決）                                   |
| **R6 天井設定 API**               | GET/PATCH `spendingCapYen`、バリデーション（負値・既消費未満拒否）、所有者限定      | `validateOwnership`、`class-validator`           | **Reuse**（CRUD 定型）。「既消費額未満を拒否」は `AiUsage` 当月集計に依存                                             |
| **R7 残高・使用状況参照 API**     | 残高・当月消費・天井の取得、当月消費は `AiUsage` 集計                               | React Query 定型                                 | **Reuse**＋**Missing**（当月集計クエリ：月境界・タイムゾーンの定義が必要）                                            |
| **R8 ハードストップ・エラー契約** | ブロック理由を識別する一意エラーコード + 残高/消費/天井を含む details               | `AppException`（`details` 対応済み）、`ApiError` | **Reuse 強**（`AppException.details` がそのまま使える）＋**Missing**（BILLING エラーコード追加）                      |
| **R9 アーキ不変則遵守**           | apiClient 経由・所有権一元化・JWT Guard + @Public・Zustand 非コピー                 | 全パターン既存                                   | **Constraint**（既存遵守）＋**注意**（要件文の `checkOwnership` は実名 `validateOwnership`）                          |

---

## 3. 実装アプローチ選択肢

### Option A: 既存モジュールへ相乗り（拡張中心）

課金ロジックを `user`/`auth` などの既存モジュールへ分散して足す。

- ✅ 新規ファイル最少・初速速い
- ❌ 課金は「ゲート・Stripe・webhook・使用量集計」と責務が広く、既存モジュールを肥大化させる
- ❌ 「AI を呼ぶ全パスが通る単一ゲート」という R1 の本質と相性が悪い（分散すると経由保証が崩れる）

→ **非推奨**。課金は独立ライフサイクル（Stripe・cron・webhook）を持つ。

### Option B: 新規 `billing` ドメインモジュール（新規作成中心）★推奨

`backend/src/billing/` を新設し、責務を内部分割する。

```
backend/src/billing/
  billing.module.ts
  billing.controller.ts        # 天井設定(R6) / 残高・使用状況参照(R7) / チャージ要求(R5)
  stripe-webhook.controller.ts # @Public() + raw body（R4/R5 webhook 受信）
  billing-gate.service.ts      # 残高・天井ガード（R1）＝全 AI パスの単一入口
  billing.service.ts           # AiUsage 計上 + 残高減算の Tx（R2）/ 天井・参照ロジック
  stripe.service.ts            # Stripe SDK ラッパ（Subscription / PaymentIntent / 署名検証）
  dto/
```

- ✅ 責務分離が綺麗・単体テスト容易（quality.md の TDD と相性◎）
- ✅ `BillingGateService` を AI 機能（後続 spec）が依存する単一の公開インターフェイスにできる → R1「全パス経由」を構造で保証
- ✅ 既存ドメインを汚さない
- ❌ ファイル数増・インターフェイス設計の初期コストがかかる
- ❌ `User` スキーマ拡張だけは横断（billing 単独では閉じない）

### Option C: ハイブリッド（段階導入）

スキーマ拡張＋`AiUsage`/`BillingGate`/参照 API（DB 完結部分）を Phase 1、Stripe 連携（webhook/決済）を Phase 2 に分割。

- ✅ Stripe の外部依存（テスト鍵・webhook トンネル）を後続に切り出し、DB 側を先に固められる
- ✅ 後続 `ai-ghostwrite` はゲートさえあれば動作確認可能（残高は手動シードでも進められる）
- ❌ 計画が2段になる／チャージ未完では残高が増やせず E2E が片肺
- ⚠️ モジュール構造は Option B のまま。「B の内部を2フェーズで埋める」のが実体

→ **B を採用しつつ、タスク分割で C のフェーズ性を取り込む**のが現実解。

---

## 4. Effort & Risk

| 項目                                  | Effort | Risk       | 一言根拠                                                               |
| ------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------- |
| Prisma スキーマ拡張 + migration（R3） | **S**  | Low        | 既存慣習に沿うだけ。`User` 拡張は default 値ありで後方互換             |
| 課金ゲート + 計上×減算 Tx（R1/R2）    | **M**  | **Medium** | パターンは既存だが**同時実行レース**対策（条件付き更新／行ロック）が肝 |
| 天井設定・参照 API（R6/R7）           | **S**  | Low        | CRUD 定型 + 当月集計クエリ。月境界 TZ だけ要確定                       |
| ハードストップ・エラー契約（R8）      | **S**  | Low        | `AppException.details` で大半が満たせる。コード追加のみ                |
| Stripe サブスク + webhook（R4）       | **L**  | **High**   | SDK 新規・raw body・署名検証・**冪等性**・付与の二重防止               |
| 追加チャージ（R5）                    | **M**  | **High**   | Payment Intent + webhook + 天井超過ブロック。未決の自動/手動既定挙動   |
| フロント（残高/使用状況/エラー導線）  | **M**  | Medium     | React Query 定型だが、ハードストップ → 引き上げ導線 UX が新規          |

**総合: L（1〜2週間）／Risk Medium〜High**。リスクの源泉は Stripe 統合（外部・冪等性・raw body）と残高減算の同時実行整合の2点に集中。

---

## 5. Research Needed（設計フェーズへ繰り越す論点）

1. **【最重要】Stripe webhook の冪等性** — `invoice.paid` 等は再送される。`stripeEventId` をユニーク記録して二重付与を防ぐ仕組み（処理済みイベントテーブル or `Purchase` のユニーク制約）が要件に未記載。設計で必須化する。
2. **【最重要】残高減算の同時実行レース** — R1 でチェック → R2 で減算の間に並行 AI 呼び出しが入ると両方がガードを通過し残高がマイナスになりうる。`UPDATE ... SET walletBalanceYen = walletBalanceYen - X WHERE walletBalanceYen >= X` の条件付き原子更新 or 行ロック（`SELECT ... FOR UPDATE`）の採否。
3. **raw body の取り回し** — `NestFactory.create(AppModule, { rawBody: true })` か webhook ルート限定の `express.raw()`。helmet/グローバル pipe との順序、`@Public()` との併用。
4. **トークン原価 → 円換算（×1.5）の換算テーブル保持** — `monetization.md` で未決（為替更新頻度・テーブルの持ち方）。本基盤は「`costYen` を受け取って減算する」境界に留め、原価計算は呼び出し側 or 設定値に委譲するか。
5. **当月消費の月境界・タイムゾーン** — `AiUsage` 集計の「当月」を JST 月初基準にするか UTC か。サブスク更新サイクルとの整合。
6. **自動/手動チャージの既定挙動** — `monetization.md` 未決。本 spec は「手動チャージ要求 API」に絞り、自動チャージは将来 spec に切るのが安全か。
7. **`spendingCapYen` の意味の二重性** — 要件で「当月チャージ・消費の上限」。天井チェックは『当月 AiUsage 合計 + 次回想定コスト > cap』か『walletBalance ベース』か、評価式の正準定義。
8. **「全 AI パスがゲートを通る」強制手段** — 規約（レビュー）か、AI 実行を `BillingGateService.executeWithBilling()` のような単一ラッパに強制する設計か。後続 spec への契約として固める。
9. **要件文言の修正** — R9.2 / CLAUDE.md の `AuthorizationService.checkOwnership` は実装上 `validateOwnership`。設計時にどちらへ寄せるか（実装名に合わせる推奨）。
10. **Stripe テスト戦略** — webhook 署名検証のユニットテスト（`stripe.webhooks.constructEvent` のモック）、`stripe listen` ローカル転送、テスト鍵の env 管理（`feedback_vercel_env_validation` の非空検証運用と整合）。
11. **将来の trial（サブスク無料期間）との接続余地** — 別 spec「招待特典」でサブスク無料期間を扱う構想あり。Stripe の `trial_period_days` を使うと **trial 中は `invoice.paid` が発火せず、R4.2 の「¥500 付与」が走らない → 無料期間中は AI 残高ゼロ**になりうる。基盤を trial 前提で作る必要はないが、R4 のサブスク／付与ロジックを「後から trial を足せる」形に保つこと（付与トリガーを invoice 一択に密結合させすぎない）。

---

## 6. 設計フェーズへの推奨

- **推奨アプローチ: Option B（新規 `billing` モジュール）＋ Option C のフェーズ分割**。`BillingGateService` を AI 機能の単一公開インターフェイスとして設計し、R1「全パス経由」を型・構造で担保する。
- **キー決定（設計で必ず確定）**: ①冪等性の実装方式、②残高減算の原子性（条件付き更新 推奨）、③raw body の取り回し、④天井評価式の正準定義、⑤換算（×1.5）の責務境界。
- **既存流用を最大化**: エラー契約は `AppException.details` をそのまま使い `ERROR_CODES.BILLING`（`INSUFFICIENT_BALANCE` / `SPENDING_CAP_EXCEEDED` 等）を追加。Tx は既存 `$transaction` 流儀。フロントは `useBillingQueries.ts` + `queryKeys.billing` を新設。
- **スコープ厳守**: Notebook 課金カラム・為替自動更新・80%警告・繰り越しは OUT のまま。チャージは「手動要求 API」に絞る方向を設計で確認。

---

## Next Steps

- ギャップ分析の論点（特に §5 の冪等性・同時実行・raw body）を設計に織り込む。
- `/kiro:spec-design ai-billing-foundation` で技術設計を作成（要件未承認のため `-y` で承認同時進行も可）。
- **注意**: `spec.json` の `approvals.requirements.approved` は現在 `false`。設計着手前に要件承認を取るのが本来の cc-sdd フロー。
