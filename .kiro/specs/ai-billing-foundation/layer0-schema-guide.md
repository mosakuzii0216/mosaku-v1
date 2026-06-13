# レイヤー0 実装ガイド — 課金データモデル（Prisma スキーマ拡張）

> ai-billing-foundation を**手動で丁寧に作り込む**ための、レイヤー0（スキーマ）作業ガイド。
> 対応要件: **R3（課金データモデル）**。正典: `.kiro/steering/monetization.md`。
> このレイヤーは全レイヤーの土台。型を1つ間違えると後で migration が増えるので、ここだけは特に慎重に。

## ゴール

- `User` に課金カラム6つを追加（全て default 付き＝後方互換）
- `AiUsage` / `Purchase` モデルと enum 3つを新規追加
- migration 1本を作成・適用し、`AiUsage` を `userId` / `notebookId` で参照可能にする

**スコープ厳守（やらないこと）**: Notebook 課金カラム（`characterLimit`/`isFree`/`purchaseId`）、Stripe 連携、ゲートロジック、API。それらはレイヤー1以降。

---

## 着手前に決めること（手動で握る設計判断）

スキーマは後から変えにくいので、コードを書く前にここだけ意思決定しておく。推奨を併記する。

| #   | 論点                                          | 選択肢                               | 推奨              | 理由                                                                                                                                                           |
| --- | --------------------------------------------- | ------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 金額カラムの型                                | `Int`（円・整数） / `Decimal`        | **`Int`**         | 円は最小単位が1円。Float/Decimal は丸め事故の温床。`costYen` `walletBalanceYen` `spendingCapYen` `amount` 全て Int                                             |
| D2  | `AiUsage.notebookId` の必須性                 | 必須 / `?`（任意）                   | **任意 `?`**      | 「AI はノートブック単位」だが、将来ノートブック外利用や集計の柔軟性のため null 許容。実行時に必須チェックはゲート側で担保                                      |
| D3  | `AiUsage.notebookId` のノートブック削除時挙動 | Cascade / SetNull / Restrict         | **SetNull**       | ノートブックを消しても**請求履歴（課金根拠）は残す**。Cascade だと売上記録が消える                                                                             |
| D4  | `AiUsage` のユーザー削除時挙動                | Cascade / Restrict                   | **Cascade**       | 既存全モデルが `onDelete: Cascade`。退会＝全データ削除の既存慣習に合わせる                                                                                     |
| D5  | `stripeCustomerId` の一意性                   | `@unique` / なし                     | **`@unique`**     | 1ユーザー = 1 Stripe Customer。二重作成を DB で防ぐ                                                                                                            |
| D6  | `Purchase.stripePaymentIntentId` の一意性     | `@unique` / なし                     | **`@unique`**     | レイヤー3の webhook 冪等性の一助（同一 PI の二重 COMPLETED を防ぐ）                                                                                            |
| D7  | チャージ用の `Purchase.type`                  | 要件どおり3値 / `WALLET_CHARGE` 追加 | **今は3値のまま** | ⚠️ 後述。要件 R3.3 は `SINGLE_NOTEBOOK\|NOTEBOOK_PACK\|SUBSCRIPTION` のみ。R5チャージの type は**未決**。enum 追加は後で migration で足せるのでレイヤー3で確定 |

> **⚠️ D7 は要件の穴**: R5（追加チャージ）の `Purchase` をどの `type` で記録するかが要件に無い。レイヤー0では要件 R3.3 に忠実に3値で作り、チャージ type はレイヤー3設計時に決める（`WALLET_CHARGE` 追加 or 既存値流用）。**この判断を先送りしてOK**（enum 値追加は非破壊的 migration）。

---

## 編集対象

`backend/prisma/schema.prisma` の **1ファイルのみ**。

### 1. `User` モデルにカラム＆リレーション追加

既存 `User` モデル（`invitationQuota` / `onboardingCompleted` の近く）にフィールドを追加し、リレーション配列も足す。

```prisma
// User モデル内に追加するフィールド（既存フィールドの並びに合わせる）
  stripeCustomerId      String?            @unique @map("stripe_customer_id")
  subscriptionStatus    SubscriptionStatus @default(NONE) @map("subscription_status")
  subscriptionExpiresAt DateTime?          @map("subscription_expires_at")
  spendingCapYen        Int                @default(2000) @map("spending_cap_yen")
  walletBalanceYen      Int                @default(0) @map("wallet_balance_yen")
  notebookCredits       Int                @default(0) @map("notebook_credits")

// User モデルの relations 配列群に追加
  aiUsages              AiUsage[]
  purchases             Purchase[]
```

### 2. `Notebook` モデルにリレーション追加（D3 のため）

```prisma
// Notebook モデルの relations に追加
  aiUsages     AiUsage[]
```

### 3. 新規モデル `AiUsage`（従量消費の唯一の根拠 / R3.2）

```prisma
model AiUsage {
  id         String    @id @default(cuid())
  userId     String    @map("user_id")
  notebookId String?   @map("notebook_id")
  action     String    @db.VarChar(50)
  tokensUsed Int       @map("tokens_used")
  costYen    Int       @map("cost_yen")
  createdAt  DateTime  @default(now()) @map("created_at")
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  notebook   Notebook? @relation(fields: [notebookId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@map("ai_usages")
}
```

> `@@index([userId, createdAt])` は **R7 の「当月消費の集計」を効かせるため**（`WHERE userId = ? AND createdAt >= 月初` が高速に引ける）。`action` は AI 機能側が値を決める文字列（`"ghostwrite"` 等）なので enum にせず `VarChar(50)`。

### 4. 新規モデル `Purchase`（R3.3）

```prisma
model Purchase {
  id                    String         @id @default(cuid())
  userId                String         @map("user_id")
  type                  PurchaseType
  amount                Int
  currency              String         @default("jpy") @db.VarChar(3)
  status                PurchaseStatus @default(PENDING)
  stripePaymentIntentId String?        @unique @map("stripe_payment_intent_id")
  stripeSubscriptionId  String?        @map("stripe_subscription_id")
  createdAt             DateTime       @default(now()) @map("created_at")
  updatedAt             DateTime       @updatedAt @map("updated_at")
  user                  User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@map("purchases")
}
```

### 5. enum 3つ（schema 末尾の enum 群に追加）

```prisma
enum SubscriptionStatus {
  NONE
  ACTIVE
  CANCELED
  EXPIRED
}

enum PurchaseType {
  SINGLE_NOTEBOOK
  NOTEBOOK_PACK
  SUBSCRIPTION
}

enum PurchaseStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}
```

---

## 手順

```bash
cd backend

# 1. schema.prisma を上記のとおり編集（手動）

# 2. migration 作成＆ローカル適用（Docker PostgreSQL が起動している前提）
npx prisma migrate dev --name add_billing_foundation

# 3. Prisma クライアント再生成（schema 変更後は必須）
npx prisma generate

# 4. 型が通るか確認（生成された型を import しなくても、まずビルドが壊れないこと）
npm run build
```

> **落とし穴メモ**（CLAUDE.md より）: Docker 環境なら名前付きボリュームで node_modules が隔離されてる。コンテナ内で開発してるなら `prisma generate` はコンテナ内で実行。`DIRECT_URL`（5432）が migration 用、`DATABASE_URL`（6543）がプーリング。

---

## 完了チェックリスト

- [ ] `User` に6カラム追加（全て default 付き＝既存ユーザーが migration で壊れない）
- [ ] `AiUsage` / `Purchase` モデルと enum 3つを追加
- [ ] `AiUsage` に `@@index([userId, createdAt])`（R7 集計用）
- [ ] D3（notebook SetNull）/ D4（user Cascade）の onDelete を確認
- [ ] `npx prisma migrate dev` が成功し、`backend/prisma/migrations/` に1本生成された
- [ ] `npx prisma generate` 成功 → `npm run build` が通る
- [ ] migration ファイルの SQL を目視（意図しない DROP / 既存カラム変更が無いこと）
- [ ] `monetization.md` の「ステータス: 計画（未実装）」を更新するかは**実装完走後**でOK（今はまだ触らない）

---

## コミット（1 Todo = 1 Commit）

```
feat(backend/billing): 課金データモデル（User拡張・AiUsage・Purchase）を追加
```

migration ファイルと `schema.prisma` を一緒にコミット。`node_modules/@prisma/client` の生成物はコミット対象外（.gitignore 済みのはず）。

> pre-commit フックは**ステージ済みファイル全体を再フォーマットして再ステージ**する（`feedback_precommit_restages_whole_file`）。部分ステージで分けたいときは注意。

---

## 次のレイヤーへの引き継ぎ

- ✅ これで `walletBalanceYen` / `spendingCapYen` / `AiUsage` の器ができた
- ▶️ **レイヤー1**: 参照 API（R7）・天井設定 API（R6）＝ DB 読むだけの安全ゾーン。`billing.module.ts` の骨格を立てる
- 🔜 **レイヤー3 への申し送り**: D7（チャージ type）と webhook 冪等性テーブルの要否を設計で確定。冪等性は「`Purchase.stripePaymentIntentId @unique` で足りるか／専用 `ProcessedStripeEvent` テーブルが要るか」を判断
